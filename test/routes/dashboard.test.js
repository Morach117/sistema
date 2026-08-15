const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../../config/database');
const dashboardRouter = require('../../routes/dashboard');
const { responseRecorder } = require('../helpers/app');

function routeHandler(router, method, path) {
  const routeLayer = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  return routeLayer.route.stack.at(-1).handle;
}

test('loads dashboard aggregates in one parameterized query', async () => {
  const originalExecute = database.execute;
  const calls = [];
  const results = [
    [[{ pendientes: 2, finalizadas_hoy: 3, total_items: 4 }], []],
    [[], []],
    [[], []]
  ];
  database.execute = async (statement, parameters) => {
    calls.push([statement, parameters]);
    return results.shift() || [[], []];
  };

  try {
    const response = responseRecorder();
    await routeHandler(dashboardRouter, 'get', '/')(
      { user: { id: 1, rol: 'admin' }, requestId: 'dashboard-request' },
      response
    );

    assert.equal(calls.length, 3);
    assert.match(calls[0][0], /pendientes/);
    assert.match(calls[0][0], /finalizadas_hoy/);
    assert.match(calls[0][0], /total_items/);
    assert.doesNotMatch(calls[0][0], /DATE\s*\(\s*fecha_carga\s*\)/i);
    assert.deepEqual(calls[0][1], ['PENDIENTE', 'REVISION', 'FINALIZADO']);
    assert.deepEqual(response.body.kpis, {
      pendientes: 2,
      finalizadas_hoy: 3,
      total_items: 4
    });
  } finally {
    database.execute = originalExecute;
  }
});

test('uses a date range for employee dashboard captures', async () => {
  const originalExecute = database.execute;
  const calls = [];
  const results = [
    [[{ pendientes: 0, finalizadas_hoy: 0, total_items: 0 }], []],
    [[], []],
    [[], []],
    [[{ count: 1, total_piezas: 6 }], []]
  ];
  database.execute = async (statement, parameters) => {
    calls.push([statement, parameters]);
    return results.shift() || [[], []];
  };

  try {
    await routeHandler(dashboardRouter, 'get', '/')(
      { user: { id: 8, rol: 'empleado' }, requestId: 'dashboard-request' },
      responseRecorder()
    );

    assert.doesNotMatch(calls[3][0], /DATE\s*\(\s*fecha\s*\)/i);
    assert.match(calls[3][0], /fecha\s*>=\s*CURRENT_DATE/i);
    assert.match(calls[3][0], /fecha\s*<\s*CURRENT_DATE\s*\+\s*INTERVAL 1 DAY/i);
    assert.deepEqual(calls[3][1], [8]);
  } finally {
    database.execute = originalExecute;
  }
});
