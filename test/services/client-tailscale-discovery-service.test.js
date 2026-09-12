const test = require('node:test');
const assert = require('node:assert/strict');

const { generateCentralIdentity } = require('../../services/client-identity-service');
const { signEnvelope } = require('../../services/client-sync-service');
const {
  createTailscaleDiscoveryService,
  isTailscaleAddress,
  tailscalePeers,
} = require('../../services/client-tailscale-discovery-service');

const NOW = 1_786_723_200_000;

function announcement(identity) {
  return signEnvelope({
    privateKey: identity.privateKey,
    payload: {
      version: 1,
      type: 'clientes-central-announcement',
      centralName: 'Central Matriz',
      centralFingerprint: identity.fingerprint,
      centralPublicKey: identity.publicKey,
      apiPort: 4312,
      issuedAt: NOW,
    },
  });
}

test('recognizes only Tailscale CGNAT addresses as private branch-network endpoints', () => {
  assert.equal(isTailscaleAddress('100.64.0.1'), true);
  assert.equal(isTailscaleAddress('100.127.255.254'), true);
  assert.equal(isTailscaleAddress('100.128.0.1'), false);
  assert.equal(isTailscaleAddress('203.0.113.20'), false);
});

test('reads online Tailscale peers without using a public hostname or address', () => {
  assert.deepEqual(tailscalePeers({ Peer: {
    first: { Online: true, TailscaleIPs: ['100.90.10.4'], DNSName: 'central.tailnet.ts.net.' },
    offline: { Online: false, TailscaleIPs: ['100.90.10.5'] },
    public: { Online: true, TailscaleIPs: ['203.0.113.5'] },
  } }), [{ address: '100.90.10.4', name: 'central.tailnet.ts.net' }]);
});

test('discovers a signed central through the private branch network and never exposes its address as a candidate', async () => {
  const central = generateCentralIdentity();
  let requestedUrl;
  const service = createTailscaleDiscoveryService({
    getConfiguration: async () => ({
      rol_nodo: 'sucursal',
      central_fingerprint: central.fingerprint,
      central_public_key: central.publicKey,
    }),
    listPeers: async () => [{ address: '100.90.10.4', name: 'central.tailnet.ts.net' }],
    fetchFn: async (url) => {
      requestedUrl = url;
      return { ok: true, async json() { return announcement(central); } };
    },
    apiPort: 4312,
    now: () => NOW,
  });

  const endpoint = await service.discover();
  assert.deepEqual(endpoint, {
    address: '100.90.10.4',
    port: 4312,
    network: 'tailscale',
    centralFingerprint: central.fingerprint,
    centralPublicKey: central.publicKey,
  });
  assert.equal(requestedUrl, 'http://100.90.10.4:4312/api/clientes-sync/anuncio');
  assert.deepEqual(service.listCandidates(), [{
    name: 'Central Matriz',
    fingerprint: central.fingerprint,
    network: 'privada',
    seenAt: NOW,
  }]);
});

test('ignores a signed Central whose pinned identity does not match this branch', async () => {
  const expected = generateCentralIdentity();
  const other = generateCentralIdentity();
  const service = createTailscaleDiscoveryService({
    getConfiguration: async () => ({
      rol_nodo: 'sucursal',
      central_fingerprint: expected.fingerprint,
      central_public_key: expected.publicKey,
    }),
    listPeers: async () => [{ address: '100.90.10.4' }],
    fetchFn: async () => ({ ok: true, async json() { return announcement(other); } }),
    now: () => NOW,
  });

  await assert.rejects(service.discover(), /Central.*red privada/i);
  assert.deepEqual(service.listCandidates(), []);
});
