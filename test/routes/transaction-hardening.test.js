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
    [[{ id: 9 }], []],
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

test('transfer creation rejects malformed, duplicate, empty or excessive product arrays before database access', async (t) => {
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
  const handler = routeHandler(router, 'post', '/guardar');
  const cases = [
    { productos: {} },
    { productos: [{ id: '', cantidad: 1 }] },
    { productos: [{ id: 'SKU-1', cantidad: Number.POSITIVE_INFINITY }] },
    { productos: [{ id: 'SKU-1', cantidad: true }] },
    { productos: [{ id: 'X'.repeat(51), cantidad: 1 }] },
    { productos: [{ id: 'SKU-1', cantidad: '100000000' }] },
    { productos: [{ id: 'SKU-1', cantidad: '1.001' }] },
    { productos: [{ id: 'SKU-1', cantidad: 1 }, { id: 'sku-1', cantidad: 2 }] },
    { productos: Array.from({ length: 501 }, (_, index) => ({ id: `SKU-${index}`, cantidad: 1 })) }
  ];

  for (const body of cases) {
    await t.test(JSON.stringify(body).slice(0, 60), async () => {
      const response = responseRecorder();
      await handler({ body, user: { id: 1 }, requestId: 'route-validation' }, response);
      assert.equal(response.statusCode, 422);
      assert.equal(response.body.success, false);
    });
  }
});

test('transfer completion validates duplicate detail IDs before database access', async () => {
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

  await routeHandler(router, 'post', '/completar')({
    body: {
      id_traspaso: 4,
      detalles: [
        { detalle_id: 9, cantidad_recibida: 2 },
        { detalle_id: 9, cantidad_recibida: 3 }
      ]
    },
    user: { id: 1, rol: 'admin' },
    requestId: 'duplicate-details'
  }, response);

  assert.equal(response.statusCode, 422);
  assert.match(response.body.error, /duplic/i);
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
