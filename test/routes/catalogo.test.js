const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../../config/database');
const catalogoRouter = require('../../routes/catalogo');
const { responseRecorder } = require('../helpers/app');
const { parsePagination } = catalogoRouter;

function routeHandler(router, method, path) {
  const routeLayer = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  return routeLayer.route.stack.at(-1).handle;
}

test('clamps catalog pagination to 100 rows', () => {
  assert.deepEqual(
    parsePagination({ start: '0', length: '99999' }),
    { offset: 0, limit: 100 }
  );
});

test('normalizes malformed catalog pagination to safe values', () => {
  assert.deepEqual(
    parsePagination({ page: '-200', limit: 'not-a-number' }),
    { offset: 0, limit: 10 }
  );
});

test('uses bounded parameters in the DataTables catalog query', async () => {
  const originalExecute = database.execute;
  const calls = [];
  const results = [
    [[{ count: 4 }], []],
    [[{ count: 4 }], []],
    [[{ clave_sicar: 'SKU-1' }], []]
  ];
  database.execute = async (statement, parameters) => {
    calls.push([statement, parameters]);
    return results.shift();
  };

  try {
    const response = responseRecorder();
    await routeHandler(catalogoRouter, 'post', '/dt')(
      { body: { draw: '7', start: '-20', length: '99999' } },
      response
    );

    assert.match(calls[2][0], /LIMIT \? OFFSET \?$/);
    assert.deepEqual(calls[2][1], [100, 0]);
    assert.equal(response.body.draw, 7);
  } finally {
    database.execute = originalExecute;
  }
});

test('finds a catalog product by exact SICAR or barcode without generic pagination', async () => {
  const originalExecute = database.execute;
  const calls = [];
  const product = {
    clave_sicar: '7502269634659',
    codigo_barras: '7502269634659',
    descripcion: 'ABACO PLAST CH BOLSA JOCAR'
  };
  database.execute = async (statement, parameters) => {
    calls.push([statement, parameters]);
    return [[product], []];
  };

  try {
    const response = responseRecorder();
    await routeHandler(catalogoRouter, 'get', '/exact')(
      { query: { code: '7502269634659' } },
      response
    );

    assert.match(calls[0][0], /WHERE clave_sicar = \? OR codigo_barras = \? LIMIT 1$/);
    assert.deepEqual(calls[0][1], ['7502269634659', '7502269634659']);
    assert.deepEqual(response.body, { data: product });
  } finally {
    database.execute = originalExecute;
  }
});

for (const [method, path, requestInput] of [
  ['post', '/dt', { body: { start: '100001', length: '10' }, query: {} }],
  ['get', '/list', { body: {}, query: { page: '10002', limit: '10' } }]
]) {
  test(`rejects excessive pagination before querying ${path}`, async () => {
    const originalExecute = database.execute;
    let queryCount = 0;
    database.execute = async () => {
      queryCount += 1;
      return [[], []];
    };

    try {
      const response = responseRecorder();
      await routeHandler(catalogoRouter, method, path)(
        { ...requestInput, requestId: 'catalog-pagination-request' },
        response
      );

      assert.equal(queryCount, 0);
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.body, {
        error: 'Paginaci\u00f3n fuera de rango.',
        requestId: 'catalog-pagination-request'
      });
    } finally {
      database.execute = originalExecute;
    }
  });
}
