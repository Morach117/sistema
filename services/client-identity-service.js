const {
    createHash,
    createPublicKey,
    generateKeyPairSync,
    sign,
    timingSafeEqual,
    verify,
} = require('node:crypto');

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedFingerprint(fingerprint, fieldName = 'huella') {
    const normalized = String(fingerprint || '').toLowerCase();
    if (!FINGERPRINT_PATTERN.test(normalized)) {
        throw new TypeError(`${fieldName} no es una huella SHA-256 válida.`);
    }
    return normalized;
}

function fingerprintsEqual(left, right) {
    const leftBuffer = Buffer.from(normalizedFingerprint(left), 'hex');
    const rightBuffer = Buffer.from(normalizedFingerprint(right), 'hex');
    return timingSafeEqual(leftBuffer, rightBuffer);
}

function fingerprintPublicKey(publicKey) {
    const keyObject = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey);
    const canonicalKey = keyObject.export({
        type: 'spki',
        format: 'der',
    });
    return createHash('sha256').update(canonicalKey).digest('hex');
}

function generateSigningIdentity() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const exportedPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    return {
        publicKey: exportedPublicKey,
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        fingerprint: fingerprintPublicKey(exportedPublicKey),
    };
}

function generateCentralIdentity() {
    return generateSigningIdentity();
}

function generateBranchIdentity() {
    return generateSigningIdentity();
}

function verifyCentralFingerprint({ publicKey, fingerprint } = {}) {
    try {
        return fingerprintsEqual(fingerprintPublicKey(publicKey), fingerprint);
    } catch {
        return false;
    }
}

function timestamp(value, fieldName) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${fieldName} debe ser una marca de tiempo válida.`);
    }
    return value;
}

function expiration({ now = Date.now(), ttlMs }) {
    const issuedAt = timestamp(now, 'now');
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
        throw new TypeError('ttlMs debe ser un entero positivo.');
    }
    const expiresAt = issuedAt + ttlMs;
    if (!Number.isSafeInteger(expiresAt)) {
        throw new RangeError('La expiración de la credencial está fuera de rango.');
    }
    return { issuedAt, expiresAt };
}

function assertSigningIdentity(privateKey, fingerprint) {
    const expectedFingerprint = normalizedFingerprint(fingerprint, 'centralFingerprint');
    const derivedFingerprint = fingerprintPublicKey(createPublicKey(privateKey));
    if (!fingerprintsEqual(derivedFingerprint, expectedFingerprint)) {
        throw new Error('La clave privada no corresponde con la huella de la central.');
    }
    return expectedFingerprint;
}

function signedToken(payload, privateKey) {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = sign(null, Buffer.from(encodedPayload, 'ascii'), privateKey);
    return `${encodedPayload}.${signature.toString('base64url')}`;
}

function decodeCanonicalBase64url(value, fieldName) {
    if (!BASE64URL_PATTERN.test(value)) {
        throw new TypeError(`${fieldName} no usa base64url canónico.`);
    }
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
        throw new TypeError(`${fieldName} no usa base64url canónico.`);
    }
    return decoded;
}

function verifiedPayload(token, publicKey) {
    if (typeof token !== 'string' || token.length > 16_384) {
        throw new TypeError('El token firmado no es válido.');
    }
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new TypeError('El token firmado no es válido.');
    }
    const encodedPayload = decodeCanonicalBase64url(parts[0], 'El contenido del token');
    const signature = decodeCanonicalBase64url(parts[1], 'La firma del token');
    if (signature.length !== 64) {
        throw new TypeError('La firma Ed25519 del token no es válida.');
    }
    if (!verify(null, Buffer.from(parts[0], 'ascii'), publicKey, signature)) {
        throw new Error('La firma del token no es válida.');
    }
    let payload;
    try {
        payload = JSON.parse(encodedPayload.toString('utf8'));
    } catch {
        throw new TypeError('El contenido del token firmado no es válido.');
    }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new TypeError('El contenido del token firmado no es válido.');
    }
    return payload;
}

function verifyCommonPayload({
    payload,
    publicKey,
    expectedCentralFingerprint,
    expectedType,
    now = Date.now(),
}) {
    if (payload.version !== 1 || payload.type !== expectedType) {
        throw new Error('El tipo o versión del token firmado no es válido.');
    }
    const signedFingerprint = normalizedFingerprint(
        payload.centralFingerprint,
        'centralFingerprint'
    );
    if (
        !fingerprintsEqual(signedFingerprint, expectedCentralFingerprint) ||
        !verifyCentralFingerprint({ publicKey, fingerprint: signedFingerprint })
    ) {
        throw new Error('La huella de la central no coincide.');
    }
    timestamp(payload.issuedAt, 'issuedAt');
    timestamp(payload.expiresAt, 'expiresAt');
    if (timestamp(now, 'now') >= payload.expiresAt) {
        throw new Error('El token firmado expiró.');
    }
    if (payload.expiresAt <= payload.issuedAt) {
        throw new Error('La vigencia del token firmado no es válida.');
    }
    return payload;
}

function createLinkCode({
    privateKey,
    centralFingerprint,
    now = Date.now(),
    ttlMs = 10 * 60 * 1000,
} = {}) {
    const fingerprint = assertSigningIdentity(privateKey, centralFingerprint);
    return signedToken(
        {
            version: 1,
            type: 'link',
            centralFingerprint: fingerprint,
            ...expiration({ now, ttlMs }),
        },
        privateKey
    );
}

function verifyLinkCode({
    code,
    publicKey,
    expectedCentralFingerprint,
    now = Date.now(),
} = {}) {
    const payload = verifiedPayload(code, publicKey);
    return verifyCommonPayload({
        payload,
        publicKey,
        expectedCentralFingerprint,
        expectedType: 'link',
        now,
    });
}

function issueBranchCredential({
    privateKey,
    centralFingerprint,
    branchId,
    branchPublicKey,
    now = Date.now(),
    ttlMs = 90 * 24 * 60 * 60 * 1000,
} = {}) {
    if (!UUID_PATTERN.test(String(branchId || ''))) {
        throw new TypeError('branchId debe ser un UUID válido.');
    }
    const fingerprint = assertSigningIdentity(privateKey, centralFingerprint);
    return signedToken(
        {
            version: 1,
            type: 'branch-credential',
            centralFingerprint: fingerprint,
            branchId: branchId.toLowerCase(),
            branchKeyFingerprint: fingerprintPublicKey(branchPublicKey),
            ...expiration({ now, ttlMs }),
        },
        privateKey
    );
}

function verifyBranchCredential({
    credential,
    centralPublicKey,
    expectedCentralFingerprint,
    expectedBranchId,
    branchPublicKey,
    now = Date.now(),
} = {}) {
    const payload = verifyCommonPayload({
        payload: verifiedPayload(credential, centralPublicKey),
        publicKey: centralPublicKey,
        expectedCentralFingerprint,
        expectedType: 'branch-credential',
        now,
    });
    if (
        !UUID_PATTERN.test(String(expectedBranchId || '')) ||
        payload.branchId !== expectedBranchId.toLowerCase()
    ) {
        throw new Error('La credencial no corresponde a esta sucursal.');
    }
    if (!fingerprintsEqual(payload.branchKeyFingerprint, fingerprintPublicKey(branchPublicKey))) {
        throw new Error('La credencial no corresponde a la clave de esta sucursal.');
    }
    return payload;
}

module.exports = {
    createLinkCode,
    fingerprintPublicKey,
    generateBranchIdentity,
    generateCentralIdentity,
    issueBranchCredential,
    verifyBranchCredential,
    verifyCentralFingerprint,
    verifyLinkCode,
};
