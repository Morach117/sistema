const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createLinkCode,
    fingerprintPublicKey,
    generateBranchIdentity,
    generateCentralIdentity,
    issueBranchCredential,
    verifyBranchCredential,
    verifyCentralFingerprint,
    verifyLinkCode,
} = require('../../services/client-identity-service');

function tamperSignature(token) {
    const [payload, signature] = token.split('.');
    const replacement = signature[0] === 'A' ? 'B' : 'A';
    return `${payload}.${replacement}${signature.slice(1)}`;
}

test('derives a stable central fingerprint from the public signing key', () => {
    const central = generateCentralIdentity();
    const differentCentral = generateCentralIdentity();

    assert.match(central.publicKey, /BEGIN PUBLIC KEY/);
    assert.match(central.privateKey, /BEGIN PRIVATE KEY/);
    assert.match(central.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(fingerprintPublicKey(central.publicKey), central.fingerprint);
    assert.equal(
        verifyCentralFingerprint({
            publicKey: central.publicKey,
            fingerprint: central.fingerprint,
        }),
        true
    );
    assert.equal(
        verifyCentralFingerprint({
            publicKey: differentCentral.publicKey,
            fingerprint: central.fingerprint,
        }),
        false
    );
});

test('verifies an unexpired link code signed by its central', () => {
    const central = generateCentralIdentity();
    const code = createLinkCode({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        now: 1_723_689_600_000,
        ttlMs: 60_000,
    });

    assert.deepEqual(
        verifyLinkCode({
            code,
            publicKey: central.publicKey,
            expectedCentralFingerprint: central.fingerprint,
            now: 1_723_689_659_999,
        }),
        {
            version: 1,
            type: 'link',
            centralFingerprint: central.fingerprint,
            issuedAt: 1_723_689_600_000,
            expiresAt: 1_723_689_660_000,
        }
    );
});

test('rejects a modified or expired link code', () => {
    const central = generateCentralIdentity();
    const code = createLinkCode({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        now: 1_723_689_600_000,
        ttlMs: 60_000,
    });
    const verification = {
        publicKey: central.publicKey,
        expectedCentralFingerprint: central.fingerprint,
    };

    assert.throws(
        () => verifyLinkCode({ ...verification, code: tamperSignature(code), now: 1_723_689_600_001 }),
        /firma|inv[aá]lid/i
    );
    assert.throws(
        () => verifyLinkCode({ ...verification, code, now: 1_723_689_660_001 }),
        /expir|venc/i
    );
});

test('rejects non-canonical textual representations of a signed link code', () => {
    const central = generateCentralIdentity();
    const code = createLinkCode({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        now: 1_723_689_600_000,
        ttlMs: 60_000,
    });
    const verification = {
        publicKey: central.publicKey,
        expectedCentralFingerprint: central.fingerprint,
        now: 1_723_689_600_001,
    };

    assert.throws(
        () => verifyLinkCode({ ...verification, code: `${code}!` }),
        /token|firma|can[oó]nic|inv[aá]lid/i
    );
    assert.throws(
        () => verifyLinkCode({ ...verification, code: `${code}=` }),
        /token|firma|can[oó]nic|inv[aá]lid/i
    );
});

test('issues a signed branch credential bound to its UUID and signing key', () => {
    const central = generateCentralIdentity();
    const branch = generateBranchIdentity();
    const branchId = 'b7cbf73a-d143-4be7-9504-2668760da581';
    const credential = issueBranchCredential({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        branchId,
        branchPublicKey: branch.publicKey,
        now: 1_723_689_600_000,
        ttlMs: 86_400_000,
    });

    const payload = verifyBranchCredential({
        credential,
        centralPublicKey: central.publicKey,
        expectedCentralFingerprint: central.fingerprint,
        expectedBranchId: branchId,
        branchPublicKey: branch.publicKey,
        now: 1_723_700_000_000,
    });

    assert.equal(payload.type, 'branch-credential');
    assert.equal(payload.branchId, branchId);
    assert.equal(payload.branchKeyFingerprint, branch.fingerprint);
});

test('rejects a branch credential presented by another branch key', () => {
    const central = generateCentralIdentity();
    const branch = generateBranchIdentity();
    const otherBranch = generateBranchIdentity();
    const branchId = 'b7cbf73a-d143-4be7-9504-2668760da581';
    const credential = issueBranchCredential({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        branchId,
        branchPublicKey: branch.publicKey,
        now: 1_723_689_600_000,
        ttlMs: 86_400_000,
    });

    assert.throws(
        () =>
            verifyBranchCredential({
                credential,
                centralPublicKey: central.publicKey,
                expectedCentralFingerprint: central.fingerprint,
                expectedBranchId: branchId,
                branchPublicKey: otherBranch.publicKey,
                now: 1_723_700_000_000,
            }),
        /clave|credencial|sucursal/i
    );
});

test('does not copy IP addresses or hostnames into signed identity payloads', () => {
    const central = generateCentralIdentity();
    const branch = generateBranchIdentity();
    const code = createLinkCode({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        now: 1_723_689_600_000,
        ttlMs: 60_000,
        ip: '192.168.1.50',
        hostname: 'central.local',
    });
    const credential = issueBranchCredential({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        branchId: 'b7cbf73a-d143-4be7-9504-2668760da581',
        branchPublicKey: branch.publicKey,
        now: 1_723_689_600_000,
        ttlMs: 60_000,
        ip: '192.168.1.51',
        hostname: 'branch.local',
    });

    const linkPayload = verifyLinkCode({
        code,
        publicKey: central.publicKey,
        expectedCentralFingerprint: central.fingerprint,
        now: 1_723_689_600_001,
    });
    const credentialPayload = verifyBranchCredential({
        credential,
        centralPublicKey: central.publicKey,
        expectedCentralFingerprint: central.fingerprint,
        expectedBranchId: 'b7cbf73a-d143-4be7-9504-2668760da581',
        branchPublicKey: branch.publicKey,
        now: 1_723_689_600_001,
    });

    for (const payload of [linkPayload, credentialPayload]) {
        assert.equal(Object.hasOwn(payload, 'ip'), false);
        assert.equal(Object.hasOwn(payload, 'hostname'), false);
    }
});
