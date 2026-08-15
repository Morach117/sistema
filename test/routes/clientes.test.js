const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { createApp } = require('../../app');
const { createClientesRouter } = require('../../routes/clientes');
const { request } = require('../helpers/app');
const { errorHandler } = require('../../middleware/errors');
const { requestContext } = require('../../middleware/request-context');

const jwtSecret = 'clientes-routes-test-secret-32-characters';
process.env.JWT_SECRET = jwtSecret;
const CLIENT_ID = '7b34f30e-31e8-44f5-9db3-d81220d10070';

function authToken({ rol = 'empleado', permisos = ['clientes'], id = 7 } = {}) {
  return jwt.sign({ id, rol, permisos }, jwtSecret);
}

function buildApp(clientesService) {
  const app = express();
  app.use(requestContext);
  app.use(express.json());
  app.use('/api/clientes', createClientesRouter({ clientesService }));
  app.use(errorHandler);
  return app;
}

function serviceDouble(overrides = {}) {
  const unexpected = async (name) => assert.fail(`unexpected service call: ${name}`);
  return {
    listClientes: () => unexpected('listClientes'),
    getCliente: () => unexpected('getCliente'),
    createCliente: () => unexpected('createCliente'),
    updateCliente: () => unexpected('updateCliente'),
    deactivateCliente: () => unexpected('deactivateCliente'),
    listPurchases: () => unexpected('listPurchases'),
    registerPurchase: () => unexpected('registerPurchase'),
    ...overrides
  };
}

test('mounts the clients router in the application and protects it with authentication', async () => {
  const response = await request(createApp()).get('/api/clientes');

  assert.equal(response.status, 401);
  assert.match(response.body.error, /token|acceso/i);
});

test('denies users without the clientes permission before calling the service', async () => {
  const app = buildApp(serviceDouble());
  const token = authToken({ permisos: [] });

  const responses = await Promise.all([
    request(app).get('/api/clientes').set('Authorization', `Bearer ${token}`),
    request(app).post('/api/clientes').set('Authorization', `Bearer ${token}`).send({ nombre: 'Ana' })
  ]);

  assert.deepEqual(responses.map((response) => response.status), [403, 403]);
});

test('returns a searchable paginated client list to an authorized user', async () => {
  const calls = [];
  const app = buildApp(serviceDouble({
    async listClientes(filters) {
      calls.push(filters);
      return {
        data: [{ id: CLIENT_ID, nombre: 'Ana', activo: true }],
        paginacion: { pagina: 2, limite: 25, total: 1, totalPaginas: 1 }
      };
    }
  }));

  const response = await request(app)
    .get('/api/clientes?pagina=2&limite=25&buscar=Ana&activo=todos')
    .set('Authorization', `Bearer ${authToken()}`);

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(calls, [{ pagina: '2', limite: '25', buscar: 'Ana', activo: 'todos' }]);
  assert.equal(response.body.data[0].nombre, 'Ana');
  assert.equal(response.body.paginacion.pagina, 2);
});

test('returns client detail and paginated purchases through protected read routes', async () => {
  const calls = [];
  const app = buildApp(serviceDouble({
    async getCliente(input) {
      calls.push(['detail', input]);
      return { id: input.clienteId, nombre: 'Ana', activo: true };
    },
    async listPurchases(input) {
      calls.push(['purchases', input]);
      return {
        data: [{ id: 'purchase-id', cliente_id: input.clienteId, total: 25 }],
        paginacion: { pagina: 2, limite: 10, total: 11, totalPaginas: 2 }
      };
    }
  }));
  const token = authToken();

  const detail = await request(app)
    .get(`/api/clientes/${CLIENT_ID}`)
    .set('Authorization', `Bearer ${token}`);
  const purchases = await request(app)
    .get(`/api/clientes/${CLIENT_ID}/compras?pagina=2&limite=10`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(detail.status, 200, detail.text);
  assert.equal(purchases.status, 200, purchases.text);
  assert.deepEqual(calls, [
    ['detail', { clienteId: CLIENT_ID }],
    ['purchases', { clienteId: CLIENT_ID, pagina: '2', limite: '10' }]
  ]);
  assert.equal(purchases.body.paginacion.total, 11);
});

test('creates and edits clients without forwarding a browser-selected branch', async () => {
  const calls = [];
  const app = buildApp(serviceDouble({
    async createCliente(input) {
      calls.push(['create', input]);
      return { id: CLIENT_ID, nombre: input.nombre, activo: true, version: 1 };
    },
    async updateCliente(input) {
      calls.push(['update', input]);
      return { id: input.clienteId, nombre: input.nombre, activo: true, version: 2 };
    }
  }));
  const token = authToken({ id: 27 });

  const created = await request(app)
    .post('/api/clientes')
    .set('Authorization', `Bearer ${token}`)
    .send({ nombre: 'Ana', sucursal_id: 'browser-branch', origen_sucursal_id: 'browser-origin' });
  const updated = await request(app)
    .put(`/api/clientes/${CLIENT_ID}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ nombre: 'Ana López', sucursal_id: 'browser-branch' });

  assert.equal(created.status, 201, created.text);
  assert.equal(updated.status, 200, updated.text);
  assert.deepEqual(calls, [
    ['create', {
      nombre: 'Ana',
      telefono: undefined,
      correo: undefined,
      notas: undefined,
      actorId: 27,
      requestId: created.headers['x-request-id']
    }],
    ['update', {
      clienteId: CLIENT_ID,
      nombre: 'Ana López',
      telefono: undefined,
      correo: undefined,
      notas: undefined,
      actorId: 27,
      requestId: updated.headers['x-request-id']
    }]
  ]);
});

test('deactivates clients through a write-protected route and exposes no delete endpoint', async () => {
  const calls = [];
  const app = buildApp(serviceDouble({
    async deactivateCliente(input) {
      calls.push(input);
      return { id: input.clienteId, activo: false, version: 3 };
    }
  }));
  const token = authToken({ id: 30 });

  const deactivated = await request(app)
    .post(`/api/clientes/${CLIENT_ID}/desactivar`)
    .set('Authorization', `Bearer ${token}`);
  const deletion = await request(app)
    .delete(`/api/clientes/${CLIENT_ID}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(deactivated.status, 200, deactivated.text);
  assert.deepEqual(calls, [{
    clienteId: CLIENT_ID,
    actorId: 30,
    requestId: deactivated.headers['x-request-id']
  }]);
  assert.equal(deletion.status, 404);
});

test('registers purchases with optional folios without forwarding a browser-selected branch', async () => {
  const calls = [];
  const app = buildApp(serviceDouble({
    async registerPurchase(input) {
      calls.push(input);
      return { id: 'purchase-id', cliente_id: input.clienteId, folio_ticket: input.folio_ticket };
    }
  }));
  const token = authToken({ id: 31 });

  const withFolio = await request(app)
    .post(`/api/clientes/${CLIENT_ID}/compras`)
    .set('Authorization', `Bearer ${token}`)
    .send({ folio_ticket: 'T-100', total: 50, detalle: [{ sku: 'A' }], sucursal_id: 'browser-branch' });
  const withoutFolio = await request(app)
    .post(`/api/clientes/${CLIENT_ID}/compras`)
    .set('Authorization', `Bearer ${token}`)
    .send({ total: 25 });

  assert.equal(withFolio.status, 201, withFolio.text);
  assert.equal(withoutFolio.status, 201, withoutFolio.text);
  assert.equal(calls.some((call) => Object.hasOwn(call, 'sucursal_id')), false);
  assert.deepEqual(calls, [
    {
      clienteId: CLIENT_ID,
      folio_ticket: 'T-100',
      total: 50,
      detalle: [{ sku: 'A' }],
      fecha_compra: undefined,
      actorId: 31,
      requestId: withFolio.headers['x-request-id']
    },
    {
      clienteId: CLIENT_ID,
      folio_ticket: undefined,
      total: 25,
      detalle: undefined,
      fecha_compra: undefined,
      actorId: 31,
      requestId: withoutFolio.headers['x-request-id']
    }
  ]);
});

test('maps public duplicate-folio service errors without leaking internals', async () => {
  const duplicate = Object.assign(new Error('El folio ya existe en esta sucursal.'), {
    status: 409,
    isPublic: true
  });
  const app = buildApp(serviceDouble({
    async registerPurchase() { throw duplicate; }
  }));

  const response = await request(app)
    .post(`/api/clientes/${CLIENT_ID}/compras`)
    .set('Authorization', `Bearer ${authToken()}`)
    .send({ folio_ticket: 'T-100', total: 10 });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /folio/i);
  assert.ok(response.body.requestId);
});
