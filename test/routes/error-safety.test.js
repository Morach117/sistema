const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { request, responseRecorder } = require('../helpers/app');

const jwtSecret = 'test-secret-that-is-at-least-32-characters';
const privateMessage = 'ER_BAD_FIELD_ERROR: Unknown column private_secret in SQL statement';
process.env.JWT_SECRET = jwtSecret;

const databasePath = require.resolve('../../config/database');
const databaseError = new TypeError(privateMessage);
let connectionFailure;
let rollbackFailure;
const failingConnection = {
  async beginTransaction() {},
  async execute() { throw databaseError; },
  async commit() {},
  async rollback() {
    if (rollbackFailure) throw rollbackFailure;
  },
  release() {}
};
const failingPool = {
  async execute() { throw databaseError; },
  async query() { throw databaseError; },
  async getConnection() {
    if (connectionFailure) throw connectionFailure;
    return failingConnection;
  }
};
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: failingPool
};

const { createApp } = require('../../app');
const bodegaRouter = require('../../routes/bodega');

function bearerToken(module) {
  return jwt.sign({ id: 1, rol: 'admin', permisos: [module] }, jwtSecret);
}

const failingRequests = [
  ['dashboard', (app) => request(app).get('/api/dashboard')],
  ['bodega', (app) => request(app).get('/api/bodega')],
  ['catalogo', (app) => request(app).get('/api/catalogo/list')],
  ['usuarios', (app) => request(app).get('/api/usuarios/listar')],
  ['usuarios', (app) => request(app).post('/api/usuarios/permisos/guardar').send({ usuario_id: 1, modulos: ['bodega'] })],
  ['traspasos', (app) => request(app).get('/api/traspasos/buscar?q=SKU-1')],
  ['recepciones', (app) => request(app).get('/api/recepciones')],
  ['captura', (app) => request(app).get('/api/captura/historial')],
  ['reclamaciones', (app) => request(app).get('/api/reclamaciones')],
  ['evolucion-precios', (app) => request(app).get('/api/evolucion-precios?buscar_codigo=SKU-1')],
  ['recepciones', (app) => request(app).post('/api/recepciones/generar_excel').send({ remision_id: 1 })]
];

for (const [module, makeRequest] of failingRequests) {
  test(`${module} route conceals database failures`, async () => {
    const originalError = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);

    try {
      const response = await makeRequest(createApp())
        .set('Authorization', `Bearer ${bearerToken(module)}`);

      assert.equal(response.status, 500);
      assert.deepEqual(response.body, {
        success: false,
        error: 'Ocurri\u00f3 un error interno.',
        requestId: response.headers['x-request-id']
      });
      assert.doesNotMatch(response.text, /private_secret/);
      assert.ok(logged.length > 0, 'internal error must be logged server-side');
      const structuredLogs = logged.map(([entry]) => JSON.parse(entry));
      assert.ok(
        structuredLogs.every((entry) => entry.context?.requestId === response.body.requestId),
        'every request error log must carry the request ID'
      );
    } finally {
      console.error = originalError;
    }
  });
}

function routeHandler(router, method, path) {
  const routeLayer = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  return routeLayer.route.stack.at(-1).handle;
}

function inventoryRequest() {
  return {
    body: { clave_sicar: 'SKU-1', tipo: 'ENTRADA', cantidad: 1 },
    requestId: 'request-transaction',
    user: { id: 1, rol: 'admin', permisos: ['bodega'] }
  };
}

test('connection acquisition failures receive the safe 500 response', async () => {
  connectionFailure = databaseError;
  const response = responseRecorder();
  const originalError = console.error;
  console.error = () => {};

  try {
    await assert.doesNotReject(() => routeHandler(bodegaRouter, 'post', '/guardar')(
      inventoryRequest(),
      response
    ));
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      success: false,
      error: 'Ocurri\u00f3 un error interno.',
      requestId: 'request-transaction'
    });
  } finally {
    connectionFailure = undefined;
    console.error = originalError;
  }
});

test('rollback failures do not replace the original safe 500 response', async () => {
  rollbackFailure = new Error('rollback private details');
  const response = responseRecorder();
  const originalError = console.error;
  console.error = () => {};

  try {
    await assert.doesNotReject(() => routeHandler(bodegaRouter, 'post', '/guardar')(
      inventoryRequest(),
      response
    ));
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      success: false,
      error: 'Ocurri\u00f3 un error interno.',
      requestId: 'request-transaction'
    });
  } finally {
    rollbackFailure = undefined;
    console.error = originalError;
  }
});
