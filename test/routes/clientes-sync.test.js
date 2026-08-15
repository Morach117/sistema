const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { createApp } = require('../../app');
const { createClientesSyncRouter } = require('../../routes/clientes-sync');
const { errorHandler } = require('../../middleware/errors');
const { requestContext } = require('../../middleware/request-context');
const { request } = require('../helpers/app');

const jwtSecret = 'clientes-sync-route-secret-32-characters';
process.env.JWT_SECRET = jwtSecret;

function buildApp({ syncService, discoveryService, lanAccess }) {
  const app = express();
  app.use(requestContext);
  app.use(express.json());
  app.use('/api/clientes-sync', createClientesSyncRouter({ syncService, discoveryService, lanAccess }));
  app.use(errorHandler);
  return app;
}

function adminToken(overrides = {}) {
  return jwt.sign({ id: 1, rol: 'admin', permisos: [], ...overrides }, jwtSecret);
}

function serviceDouble(overrides = {}) {
  return {
    async linkBranch() { assert.fail('unexpected linkBranch call'); },
    async acceptSync() { assert.fail('unexpected acceptSync call'); },
    async createPairingCode() { assert.fail('unexpected createPairingCode call'); },
    async pairWithCentral() { assert.fail('unexpected pairWithCentral call'); },
    ...overrides,
  };
}

test('mounts the LAN pairing route in the main application', async () => {
  const response = await request(createApp())
    .post('/api/clientes-sync/vincular')
    .send({});

  assert.notEqual(response.status, 404);
  assert.ok([400, 422].includes(response.status), response.text);
});

test('forwards signed pairing and sync envelopes without requiring a browser JWT', async () => {
  const calls = [];
  const app = buildApp({
    syncService: serviceDouble({
      async linkBranch(input) {
        calls.push(['link', input]);
        return { payload: { type: 'clientes-link-response' }, signature: 'central-signature' };
      },
      async acceptSync(input) {
        calls.push(['sync', input]);
        return { payload: { type: 'clientes-sync-response' }, signature: 'central-signature' };
      },
    }),
    discoveryService: { discover: async () => null },
  });
  const linkEnvelope = {
    payload: { type: 'clientes-link-request', branchId: 'branch-id' },
    signature: 'branch-signature',
  };
  const syncEnvelope = {
    payload: { type: 'clientes-sync-request', operations: [] },
    signature: 'branch-signature',
  };

  const linked = await request(app)
    .post('/api/clientes-sync/vincular')
    .send(linkEnvelope);
  const synchronized = await request(app)
    .post('/api/clientes-sync/sincronizar')
    .send(syncEnvelope);

  assert.equal(linked.status, 201, linked.text);
  assert.equal(synchronized.status, 200, synchronized.text);
  assert.deepEqual(calls, [
    ['link', { envelope: linkEnvelope, requestId: linked.headers['x-request-id'] }],
    ['sync', { envelope: syncEnvelope, requestId: synchronized.headers['x-request-id'] }],
  ]);
  assert.equal(linked.body.signature, 'central-signature');
  assert.equal(synchronized.body.signature, 'central-signature');
});

test('rejects machine-to-machine pairing and sync from a non-LAN socket before service access', async () => {
  const app = buildApp({
    syncService: serviceDouble(),
    discoveryService: { discover: async () => null },
    lanAccess: () => false,
  });

  const responses = await Promise.all([
    request(app).post('/api/clientes-sync/vincular').send({ payload: {}, signature: 'x' }),
    request(app).post('/api/clientes-sync/sincronizar').send({ payload: {}, signature: 'x' }),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [403, 403]);
  assert.ok(responses.every((response) => /LAN|local|denegado/i.test(response.body.error)));
});

test('limits manual discovery to local administrators while returning only a volatile endpoint', async () => {
  const calls = [];
  const endpoint = {
    address: '192.168.20.5',
    port: 4312,
    centralFingerprint: 'a'.repeat(64),
  };
  const app = buildApp({
    syncService: serviceDouble(),
    discoveryService: {
      async discover() {
        calls.push('discover');
        return endpoint;
      },
    },
  });

  const denied = await request(app)
    .post('/api/clientes-sync/descubrir')
    .set('Authorization', `Bearer ${adminToken({ rol: 'empleado', permisos: ['clientes'] })}`);
  const allowed = await request(app)
    .post('/api/clientes-sync/descubrir')
    .set('Authorization', `Bearer ${adminToken()}`);

  assert.equal(denied.status, 403);
  assert.equal(allowed.status, 200, allowed.text);
  assert.deepEqual(allowed.body.data, endpoint);
  assert.deepEqual(calls, ['discover']);
});

test('lets only an administrator generate and consume a link code without forwarding a manual IP', async () => {
  const calls = [];
  const app = buildApp({
    syncService: serviceDouble({
      async createPairingCode(input) {
        calls.push(['code', input]);
        return { code: 'signed-link-code' };
      },
      async pairWithCentral(input) {
        calls.push(['pair', input]);
        return { centralId: 'central-id', centralFingerprint: 'a'.repeat(64) };
      },
    }),
    discoveryService: { discover: async () => null },
  });
  const token = adminToken();

  const code = await request(app)
    .post('/api/clientes-sync/codigo-vinculo')
    .set('Authorization', `Bearer ${token}`);
  const paired = await request(app)
    .post('/api/clientes-sync/emparejar')
    .set('Authorization', `Bearer ${token}`)
    .send({
      codigo_vinculo: 'signed-link-code',
      nombre_sucursal: 'Sucursal Norte',
      ip: '203.0.113.20',
      hostname: 'manual-central',
    });

  assert.equal(code.status, 200, code.text);
  assert.equal(code.body.data.code, 'signed-link-code');
  assert.equal(paired.status, 200, paired.text);
  assert.deepEqual(calls, [
    ['code', { requestId: code.headers['x-request-id'] }],
    ['pair', {
      linkCode: 'signed-link-code',
      branchName: 'Sucursal Norte',
      requestId: paired.headers['x-request-id'],
    }],
  ]);
});

test('returns public sync validation errors without leaking internal details', async () => {
  const error = Object.assign(new Error('El lote excede el límite de 100 operaciones.'), {
    status: 422,
    isPublic: true,
  });
  const app = buildApp({
    syncService: serviceDouble({ async acceptSync() { throw error; } }),
    discoveryService: { discover: async () => null },
  });

  const response = await request(app)
    .post('/api/clientes-sync/sincronizar')
    .send({ payload: {}, signature: 'invalid' });

  assert.equal(response.status, 422);
  assert.match(response.body.error, /lote.*l[ií]mite/i);
  assert.ok(response.body.requestId);
});
