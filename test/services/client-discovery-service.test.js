const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  createLinkCode,
  generateCentralIdentity,
} = require('../../services/client-identity-service');
const {
  createClientDiscoveryService,
} = require('../../services/client-discovery-service');
const {
  signEnvelope,
  verifySignedEnvelope,
} = require('../../services/client-sync-service');

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.closed = false;
    this.broadcastEnabled = false;
  }

  bind(port) {
    this.boundPort = port;
    queueMicrotask(() => this.emit('listening'));
  }

  setBroadcast(enabled) {
    this.broadcastEnabled = enabled;
  }

  send(packet, port, address, callback) {
    this.sent.push({ packet: Buffer.from(packet), port, address });
    if (callback) callback();
  }

  close(callback) {
    this.closed = true;
    if (callback) callback();
  }
}

function centralConfiguration(identity, overrides = {}) {
  return {
    rol_nodo: 'central',
    central_fingerprint: identity.fingerprint,
    central_public_key: identity.publicKey,
    central_private_key: identity.privateKey,
    ...overrides,
  };
}

test('a central announces a signed identity only to directed broadcasts on local IPv4 interfaces', async () => {
  const central = generateCentralIdentity();
  const socket = new FakeSocket();
  const service = createClientDiscoveryService({
    createSocket: () => socket,
    getConfiguration: async () => centralConfiguration(central),
    networkInterfaces: () => ({
      Ethernet: [{
        family: 'IPv4',
        internal: false,
        address: '192.168.50.23',
        netmask: '255.255.255.0',
      }],
      Loopback: [{
        family: 'IPv4',
        internal: true,
        address: '127.0.0.1',
        netmask: '255.0.0.0',
      }],
    }),
    discoveryPort: 39091,
    apiPort: 4312,
    now: () => 1_786_723_200_000,
    announceIntervalMs: 60_000,
  });

  await service.start();

  assert.equal(socket.broadcastEnabled, true);
  assert.equal(socket.sent.length, 1);
  assert.deepEqual(
    { address: socket.sent[0].address, port: socket.sent[0].port },
    { address: '192.168.50.255', port: 39091 }
  );
  assert.notEqual(socket.sent[0].address, '255.255.255.255');

  const envelope = JSON.parse(socket.sent[0].packet.toString('utf8'));
  const payload = verifySignedEnvelope({
    envelope,
    publicKey: central.publicKey,
    expectedType: 'clientes-central-announcement',
    now: 1_786_723_200_000,
  });
  assert.equal(payload.centralFingerprint, central.fingerprint);
  assert.equal(payload.apiPort, 4312);
  assert.equal(Object.hasOwn(payload, 'address'), false);
  assert.equal(Object.hasOwn(payload, 'hostname'), false);

  socket.emit('message', Buffer.from(JSON.stringify({
    version: 1,
    type: 'clientes-central-discovery',
  })), { address: '203.0.113.50', port: 39091 });
  assert.equal(socket.sent.length, 1);
  socket.emit('message', Buffer.from(JSON.stringify({
    version: 1,
    type: 'clientes-central-discovery',
  })), { address: '192.168.50.50', port: 39091 });
  assert.equal(socket.sent.length, 2);
  assert.equal(socket.sent[1].address, '192.168.50.50');

  await service.stop();
  assert.equal(socket.closed, true);
});

test('a branch ignores an announcement whose fingerprint is not the configured central', async () => {
  const expectedCentral = generateCentralIdentity();
  const unknownCentral = generateCentralIdentity();
  const socket = new FakeSocket();
  const service = createClientDiscoveryService({
    createSocket: () => socket,
    getConfiguration: async () => ({
      rol_nodo: 'sucursal',
      central_fingerprint: expectedCentral.fingerprint,
      central_public_key: expectedCentral.publicKey,
    }),
    networkInterfaces: () => ({
      Ethernet: [{
        family: 'IPv4',
        internal: false,
        address: '10.20.30.8',
        netmask: '255.255.255.0',
      }],
    }),
    discoveryPort: 39091,
    discoveryTimeoutMs: 100,
    now: () => 1_786_723_200_000,
  });
  await service.start();

  const discovery = service.discover();
  const unknownEnvelope = signEnvelope({
    privateKey: unknownCentral.privateKey,
    payload: {
      version: 1,
      type: 'clientes-central-announcement',
      centralFingerprint: unknownCentral.fingerprint,
      centralPublicKey: unknownCentral.publicKey,
      apiPort: 4312,
      issuedAt: 1_786_723_200_000,
    },
  });
  socket.emit('message', Buffer.from(JSON.stringify(unknownEnvelope)), {
    address: '10.20.30.77',
    port: 39091,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.getLastCentral(), null);

  const expectedEnvelope = signEnvelope({
    privateKey: expectedCentral.privateKey,
    payload: {
      version: 1,
      type: 'clientes-central-announcement',
      centralFingerprint: expectedCentral.fingerprint,
      centralPublicKey: expectedCentral.publicKey,
      apiPort: 4312,
      issuedAt: 1_786_723_200_000,
    },
  });
  socket.emit('message', Buffer.from(JSON.stringify(expectedEnvelope)), {
    address: '203.0.113.42',
    port: 39091,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.getLastCentral(), null);

  socket.emit('message', Buffer.from(JSON.stringify(expectedEnvelope)), {
    address: '10.20.30.42',
    port: 39091,
  });

  assert.deepEqual(await discovery, {
    address: '10.20.30.42',
    port: 4312,
    centralFingerprint: expectedCentral.fingerprint,
  });
  assert.deepEqual(service.getLastCentral(), {
    address: '10.20.30.42',
    port: 4312,
    centralFingerprint: expectedCentral.fingerprint,
  });
  await service.stop();
});

test('a branch sends discovery probes but never emits central announcements', async () => {
  const central = generateCentralIdentity();
  const socket = new FakeSocket();
  const service = createClientDiscoveryService({
    createSocket: () => socket,
    getConfiguration: async () => ({
      rol_nodo: 'sucursal',
      central_fingerprint: central.fingerprint,
      central_public_key: central.publicKey,
    }),
    networkInterfaces: () => ({
      Ethernet: [{
        family: 'IPv4',
        internal: false,
        address: '172.16.4.12',
        netmask: '255.255.255.0',
      }],
    }),
    discoveryTimeoutMs: 10,
  });

  await service.start();
  await assert.rejects(service.discover(), /central.*encontr|tiempo/i);

  assert.ok(socket.sent.length >= 1);
  for (const sent of socket.sent) {
    const message = JSON.parse(sent.packet.toString('utf8'));
    assert.equal(message.type, 'clientes-central-discovery');
    assert.equal(sent.address, '172.16.4.255');
  }
  await service.stop();
});

test('an unpaired branch accepts first discovery only when the announcement validates its link code', async () => {
  const central = generateCentralIdentity();
  const socket = new FakeSocket();
  const linkCode = createLinkCode({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    now: 1_786_723_200_000,
    ttlMs: 60_000,
  });
  const service = createClientDiscoveryService({
    createSocket: () => socket,
    getConfiguration: async () => ({
      rol_nodo: 'sucursal',
      central_fingerprint: null,
      central_public_key: null,
    }),
    networkInterfaces: () => ({
      Ethernet: [{
        family: 'IPv4',
        internal: false,
        address: '192.168.80.12',
        netmask: '255.255.255.0',
      }],
    }),
    discoveryTimeoutMs: 100,
    now: () => 1_786_723_200_000,
  });
  await service.start();
  const discovery = service.discover({ linkCode });
  const announcement = signEnvelope({
    privateKey: central.privateKey,
    payload: {
      version: 1,
      type: 'clientes-central-announcement',
      centralFingerprint: central.fingerprint,
      centralPublicKey: central.publicKey,
      apiPort: 4312,
      issuedAt: 1_786_723_200_000,
    },
  });
  socket.emit('message', Buffer.from(JSON.stringify(announcement)), {
    address: '192.168.80.20',
    port: 39091,
  });

  assert.deepEqual(await discovery, {
    address: '192.168.80.20',
    port: 4312,
    centralFingerprint: central.fingerprint,
    centralPublicKey: central.publicKey,
  });
  await service.stop();
});

test('stopping discovery while configuration is pending prevents a later UDP bind', async () => {
  const central = generateCentralIdentity();
  const socket = new FakeSocket();
  let releaseConfiguration;
  const configurationGate = new Promise((resolve) => { releaseConfiguration = resolve; });
  let socketCreations = 0;
  const service = createClientDiscoveryService({
    createSocket() {
      socketCreations += 1;
      return socket;
    },
    async getConfiguration() {
      await configurationGate;
      return centralConfiguration(central);
    },
  });

  const starting = service.start();
  await service.stop();
  releaseConfiguration();
  await starting;

  assert.equal(socketCreations, 0);
  assert.equal(socket.boundPort, undefined);
});
