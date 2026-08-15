const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../../config/database');
const capturaRouter = require('../../routes/captura');
const { responseRecorder } = require('../helpers/app');

function routeHandler(router, method, path) {
  const routeLayer = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  return routeLayer.route.stack.at(-1).handle;
}

const cases = [
  {
    path: '/agregar_variante',
    request: {
      body: { clave_sicar: 'SKU-1', descripcion: 'Caja', factor: 12 },
      user: { id: 4 }
    },
    auditMarker: "'VARIANTE'",
    resultFor() { return [[], []]; }
  },
  {
    path: '/guardar',
    request: {
      body: {
        codigo: 'BOX-1', existencia: 0, bultos: 1, factor: 12,
        clave_sicar: 'SKU-1', descripcion_actual: 'Caja',
        tipo_uso: 'VENTA', registrar_nuevo: true
      },
      user: { id: 4 }
    },
    auditMarker: "'VINCULAR'",
    resultFor(statement) {
      if (statement.startsWith('SELECT id FROM configuracion_cajas')) return [[], []];
      return [[], []];
    }
  },
  {
    path: '/corregir_captura',
    request: {
      body: {
        id_historial: 9,
        codigo_barras: 'BOX-1',
        nueva_clave_sicar: 'SKU-2',
        nuevo_factor: 6
      },
      user: { id: 4 }
    },
    auditMarker: "'CORREGIR'",
    resultFor(statement) {
      if (statement.startsWith('SELECT descripcion')) return [[{ descripcion: 'Producto dos' }], []];
      if (statement.startsWith('SELECT clave_sicar')) return [[{ clave_sicar: 'SKU-1' }], []];
      if (statement.startsWith('SELECT cantidad_bultos')) return [[{ cantidad_bultos: 1, existencia: 0 }], []];
      return [[], []];
    }
  }
];

for (const scenario of cases) {
  test(`logs ${scenario.path} audit failures with cause and request ID`, async () => {
    const originalExecute = database.execute;
    const originalError = console.error;
    const auditError = new Error(`audit failed for ${scenario.path}`);
    const logged = [];
    database.execute = async (statement, parameters) => {
      if (statement.includes(scenario.auditMarker)) throw auditError;
      return scenario.resultFor(statement, parameters);
    };
    console.error = (entry) => logged.push(JSON.parse(entry));

    try {
      const response = responseRecorder();
      await routeHandler(capturaRouter, 'post', scenario.path)(
        { ...scenario.request, requestId: 'captura-audit-request' },
        response
      );

      assert.equal(response.body.success, true);
      assert.equal(logged.length, 1);
      assert.equal(logged[0].context.requestId, 'captura-audit-request');
      assert.equal(logged[0].context.error.message, auditError.message);
    } finally {
      database.execute = originalExecute;
      console.error = originalError;
    }
  });
}
