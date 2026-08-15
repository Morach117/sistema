const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { request } = require('../helpers/app');

const jwtSecret = 'receipt-preview-test-secret-32-characters';
process.env.JWT_SECRET = jwtSecret;

function loadRouterWithDatabase(database) {
  const databasePath = require.resolve('../../config/database');
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: database
  };
  const routePath = require.resolve('../../routes/recepciones');
  delete require.cache[routePath];
  return require('../../routes/recepciones');
}

function authToken() {
  return jwt.sign({ id: 7, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);
}

function buildApp(database) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/recepciones', loadRouterWithDatabase(database));
  return app;
}

test('preview-upload classifies new, pending, and finalized folios without mutating data', async () => {
  const executed = [];
  const stateByFolio = new Map([
    ['RNEW', []],
    ['RPEND', [{ id: 22, estado: 'PENDIENTE' }]],
    ['RFIN', [{ id: 33, estado: 'FINALIZADO' }]]
  ]);
  const app = buildApp({
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      executed.push([normalized, params]);
      if (/SELECT id, estado FROM historial_remisiones WHERE numero_remision = \? LIMIT 1/i.test(normalized)) {
        return [stateByFolio.get(params[0]) || [], []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async getConnection() {
      assert.fail('preview must not open a write transaction');
    }
  });

  const response = await request(app)
    .post('/api/recepciones/preview-upload')
    .set('Authorization', `Bearer ${authToken()}`)
    .attach('archivo_factura', Buffer.from(
      'REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO\nR-NEW,SKU-1,Nuevo,1,10\n'
    ), { filename: 'new.csv', contentType: 'text/csv' })
    .attach('archivo_factura', Buffer.from(
      'REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO\nR-PEND,SKU-2,Actualiza,1,20\n'
    ), { filename: 'pending.csv', contentType: 'text/csv' })
    .attach('archivo_factura', Buffer.from(
      'REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO\nR-FIN,SKU-3,Bloqueada,1,30\n'
    ), { filename: 'finalized.csv', contentType: 'text/csv' });

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(
    response.body.preview.map(({ folio, clasificacion, estadoActual, puedeGuardar }) => ({
      folio,
      clasificacion,
      estadoActual,
      puedeGuardar
    })),
    [
      { folio: 'RNEW', clasificacion: 'nuevo', estadoActual: null, puedeGuardar: true },
      { folio: 'RPEND', clasificacion: 'actualiza-pendiente', estadoActual: 'PENDIENTE', puedeGuardar: true },
      { folio: 'RFIN', clasificacion: 'folio-finalizado', estadoActual: 'FINALIZADO', puedeGuardar: false }
    ]
  );
  assert.equal(
    executed.every(([sql]) => sql.startsWith('SELECT')),
    true,
    `preview executed non-read SQL: ${JSON.stringify(executed)}`
  );
});

test('inventory export excludes physical count by default and includes it when incluir_fisico is true', async () => {
  const app = buildApp({
    async execute(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (/SELECT id, numero_remision FROM historial_remisiones/i.test(normalized)) {
        return [[{ id: 91, numero_remision: 'R-BOX' }], []];
      }
      if (/SELECT COALESCE\(/i.test(normalized)) {
        return [[{
          clave_definitiva: 'SKU-BOX',
          cantidad: 20,
          existencia_lapiz: 3,
          es_paquete: 1,
          piezas_por_paquete: 2
        }], []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    }
  });

  const withoutPhysical = await request(app)
    .post('/api/recepciones/generar_excel')
    .set('Authorization', `Bearer ${authToken()}`)
    .send({ remision_id: 'R-BOX' });

  assert.equal(withoutPhysical.status, 200, withoutPhysical.text);
  assert.match(
    withoutPhysical.text,
    /<Row><Cell ss:StyleID="sT"><Data ss:Type="String">SKU-BOX<\/Data><\/Cell><Cell><Data ss:Type="Number">10<\/Data><\/Cell><\/Row>/
  );

  const withPhysical = await request(app)
    .post('/api/recepciones/generar_excel')
    .set('Authorization', `Bearer ${authToken()}`)
    .send({ remision_id: 'R-BOX', incluir_fisico: true });

  assert.equal(withPhysical.status, 200, withPhysical.text);
  assert.match(
    withPhysical.text,
    /<Row><Cell ss:StyleID="sT"><Data ss:Type="String">SKU-BOX<\/Data><\/Cell><Cell><Data ss:Type="Number">13<\/Data><\/Cell><\/Row>/
  );
});
