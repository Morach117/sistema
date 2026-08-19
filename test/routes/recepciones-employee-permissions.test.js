const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { request } = require('../helpers/app');

const jwtSecret = 'recepciones-employee-permissions-secret';
process.env.JWT_SECRET = jwtSecret;

const database = require('../../config/database');
const recepcionesRouter = require('../../routes/recepciones');

function token({ rol = 'empleado' } = {}) {
  return jwt.sign({ id: 31, rol, permisos: ['recepciones'] }, jwtSecret);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/recepciones', recepcionesRouter);
  return app;
}

test('employee detail keeps capture data but never exposes prices, costs, discounts, or provider', async () => {
  const originalExecute = database.execute;
  database.execute = async (statement) => {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    if (/SELECT \* FROM historial_remisiones WHERE id = \?/i.test(normalized)) {
      return [[{ id: 12, numero_remision: 'R-12', proveedor: 'TONY', estado: 'PENDIENTE' }], []];
    }
    if (/SELECT hi\.\*,/i.test(normalized)) {
      return [[{
        id: 8,
        codigo_proveedor: 'F013Z',
        descripcion_original: 'Folder de costilla',
        cantidad: 10,
        existencia_lapiz: 8,
        es_paquete: 1,
        piezas_por_paquete: 5,
        clave_final: 'SICAR-8',
        clave_sicar: null,
        revision_pendiente: 0,
        costo_unitario: 14.5,
        costo_bd: 12,
        venta_bd: 21,
        aplica_iva: 1,
        iva_tasa: 0.16,
        aplica_descuento: 1,
      }], []];
    }
    assert.fail(`unexpected SQL: ${normalized}`);
  };

  try {
    const response = await request(buildApp())
      .get('/api/recepciones/12')
      .set('Authorization', `Bearer ${token()}`);

    assert.equal(response.status, 200, response.text);
    const item = response.body.datos['R-12'][0];
    assert.deepEqual(item, {
      id: 8,
      cod_prov: 'F013Z',
      desc: 'Folder de costilla',
      cant: 10,
      es_paquete: 1,
      piezas_por_paquete: 5,
      clave_final: 'SICAR-8',
      clave_sicar: 'SICAR-8',
      existencia_lapiz: 8,
      revision_pendiente: 0,
    });
    assert.equal('proveedor' in response.body, false);
  } finally {
    database.execute = originalExecute;
  }
});

test('employee may save quantity but cannot make administrative reception changes', async () => {
  const originalExecute = database.execute;
  const originalGetConnection = database.getConnection;
  const events = [];
  const results = [
    [[{ id: 8, remision_id: 12, estado: 'PENDIENTE', current_value: 10 }], []],
    [{ affectedRows: 1 }, []],
    [{ affectedRows: 1 }, []],
  ];
  database.getConnection = async () => ({
    async beginTransaction() { events.push('begin'); },
    async execute(statement, parameters) { events.push([statement, parameters]); return results.shift(); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
  });
  database.execute = async () => assert.fail('denied employee operations must not reach the database');

  try {
    const allowed = await request(buildApp())
      .post('/api/recepciones/actualizar_campo')
      .set('Authorization', `Bearer ${token()}`)
      .send({ id_item: 8, campo: 'cantidad', valor: 7 });
    assert.equal(allowed.status, 200, allowed.text);
    assert.equal(events.some(([statement]) => /UPDATE historial_items SET `cantidad`/i.test(statement)), true);

    const deniedCost = await request(buildApp())
      .post('/api/recepciones/actualizar_campo')
      .set('Authorization', `Bearer ${token()}`)
      .send({ id_item: 8, campo: 'costo_unitario', valor: 7 });
    assert.equal(deniedCost.status, 403, deniedCost.text);

    const deniedRectification = await request(buildApp())
      .post('/api/recepciones/enviar-a-rectificar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ id_item: 8 });
    assert.equal(deniedRectification.status, 403, deniedRectification.text);
  } finally {
    database.execute = originalExecute;
    database.getConnection = originalGetConnection;
  }
});
