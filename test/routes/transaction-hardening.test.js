const test = require('node:test');
const assert = require('node:assert/strict');
const { responseRecorder } = require('../helpers/app');

function routeHandler(router, method, routePath) {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === routePath && candidate.route.methods[method]
  );
  return layer.route.stack.at(-1).handle;
}

test('transfer completion exposes an ownership mismatch as 409 without committing', async () => {
  const events = [];
  const results = [
    [[{ id: 4 }], []],
    [{ affectedRows: 0 }, []]
  ];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(statement, parameters) {
      events.push(['execute', statement, parameters]);
      return results.shift();
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const databasePath = require.resolve('../../config/database');
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { async getConnection() { return connection; } }
  };
  const traspasosPath = require.resolve('../../routes/traspasos');
  delete require.cache[traspasosPath];
  const router = require('../../routes/traspasos');
  const response = responseRecorder();

  await routeHandler(router, 'post', '/completar')({
    body: {
      id_traspaso: 4,
      detalles: [{ detalle_id: 9, cantidad_recibida: 2 }]
    },
    user: { id: 1, rol: 'admin', permisos: ['admin-traspasos'] },
    requestId: 'transaction-test'
  }, response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /detalle/i);
  assert.equal(events.includes('rollback'), true);
  assert.equal(events.includes('commit'), false);
});

test('transfer completion exposes malformed detail input as 422', async () => {
  const databasePath = require.resolve('../../config/database');
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { async getConnection() { assert.fail('database access'); } }
  };
  const traspasosPath = require.resolve('../../routes/traspasos');
  delete require.cache[traspasosPath];
  const router = require('../../routes/traspasos');
  const response = responseRecorder();
  const originalError = console.error;
  console.error = () => {};

  try {
    await routeHandler(router, 'post', '/completar')({
      body: { id_traspaso: 4, detalles: { detalle_id: 9, cantidad_recibida: 2 } },
      user: { id: 1, rol: 'admin', permisos: ['admin-traspasos'] },
      requestId: 'validation-test'
    }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /detalle/i);
});
