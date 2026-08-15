const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../../config/database');
const bodegaRouter = require('../../routes/bodega');
const { responseRecorder } = require('../helpers/app');

function routeHandler(router, method, path) {
  const routeLayer = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  return routeLayer.route.stack.at(-1).handle;
}

test('builds a valid parameterized bodega search query', async () => {
  const originalExecute = database.execute;
  const calls = [];
  database.execute = async (statement, parameters) => {
    calls.push([statement, parameters]);
    return [[{ clave_sicar: 'SKU-1', descripcion: 'Producto' }], []];
  };

  try {
    const response = responseRecorder();
    await routeHandler(bodegaRouter, 'get', '/')(
      { query: { q: 'SKU-1' }, requestId: 'bodega-request' },
      response
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /WHERE b\.existencia > 0\s+AND \(c\.clave_sicar LIKE \? OR c\.descripcion LIKE \?\)/);
    assert.match(calls[0][0], /ORDER BY b\.fecha_actualizacion DESC, c\.fecha_actualizacion DESC LIMIT 100$/);
    assert.doesNotMatch(calls[0][0], /WHERE[\s\S]+WHERE/i);
    assert.deepEqual(calls[0][1], ['%SKU-1%', '%SKU-1%']);
    assert.equal(response.body[0].clave_sicar, 'SKU-1');
  } finally {
    database.execute = originalExecute;
  }
});

test('keeps the unfiltered bodega response bounded to 100 rows', async () => {
  const originalExecute = database.execute;
  const calls = [];
  database.execute = async (statement, parameters) => {
    calls.push([statement, parameters]);
    return [[], []];
  };

  try {
    await routeHandler(bodegaRouter, 'get', '/')(
      { query: {}, requestId: 'bodega-request' },
      responseRecorder()
    );

    assert.match(calls[0][0], /ORDER BY b\.fecha_actualizacion DESC, c\.fecha_actualizacion DESC LIMIT 100$/);
    assert.deepEqual(calls[0][1], []);
  } finally {
    database.execute = originalExecute;
  }
});
