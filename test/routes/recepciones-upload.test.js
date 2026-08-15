const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { request } = require('../helpers/app');
const { calculateCost } = require('../../services/reception-rules');

const jwtSecret = 'receipt-upload-test-secret-32-characters';
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

test('accepts multiple archivo_factura files and saves the whole batch in one transaction', async () => {
  const events = [];
  let nextRemisionId = 20;
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) {
      events.push(['execute', sql.replace(/\s+/g, ' ').trim(), params]);
      if (/SELECT id FROM historial_remisiones/.test(sql)) return [[], []];
      if (/INSERT INTO historial_remisiones/.test(sql)) return [{ insertId: nextRemisionId++ }, []];
      if (/SELECT id FROM historial_items/.test(sql)) return [[], []];
      return [{ affectedRows: 1 }, []];
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({
    async getConnection() { events.push('connection'); return connection; }
  }));
  const token = jwt.sign({ id: 1, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);
  const csv = (folio, sku) => Buffer.from(
    `REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO\n${folio},${sku},Producto,1,2\n`
  );

  const response = await request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo_factura', csv('R-1', 'SKU-1'), { filename: 'one.csv', contentType: 'text/csv' })
    .attach('archivo_factura', csv('R-2', 'SKU-2'), { filename: 'two.csv', contentType: 'text/csv' });

  assert.equal(response.status, 200, response.text);
  assert.equal(events.filter((event) => event === 'connection').length, 1);
  assert.equal(events.filter((event) => event === 'begin').length, 1);
  assert.equal(events.filter((event) => event === 'commit').length, 1);
  assert.equal(events.includes('rollback'), false);
});

test('rejects more than the bounded archivo_factura count before database access', async () => {
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({
    async getConnection() { assert.fail('database access'); }
  }));
  const token = jwt.sign({ id: 1, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);
  let pending = request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`);
  for (let index = 0; index < 6; index += 1) {
    pending = pending.attach('archivo_factura', Buffer.from('R-1,SKU-1,P,1,1\n'), {
      filename: `${index}.csv`,
      contentType: 'text/csv'
    });
  }

  const response = await pending;
  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
});

test('rolls back the complete multi-file batch when saving any file fails', async () => {
  const events = [];
  let itemInserts = 0;
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql) {
      if (/SELECT id FROM historial_remisiones/.test(sql)) return [[], []];
      if (/INSERT INTO historial_remisiones/.test(sql)) return [{ insertId: 20 + itemInserts }, []];
      if (/SELECT id FROM historial_items/.test(sql)) return [[], []];
      if (/INSERT INTO historial_items/.test(sql)) {
        itemInserts += 1;
        if (itemInserts === 2) throw new Error('second file persistence failed');
      }
      return [{ affectedRows: 1 }, []];
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({
    async getConnection() { return connection; }
  }));
  const token = jwt.sign({ id: 1, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);
  const csv = (folio, sku) => Buffer.from(
    `REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO\n${folio},${sku},Producto,1,2\n`
  );
  const originalError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await request(app)
      .post('/api/recepciones/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo_factura', csv('R-1', 'SKU-1'), { filename: 'one.csv', contentType: 'text/csv' })
      .attach('archivo_factura', csv('R-2', 'SKU-2'), { filename: 'two.csv', contentType: 'text/csv' });
  } finally {
    console.error = originalError;
  }

  assert.equal(response.status, 500);
  assert.equal(events.includes('rollback'), true);
  assert.equal(events.includes('commit'), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});

test('rejects reimport into a finalized remision and rolls back the whole upload', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql) {
      events.push(sql.replace(/\s+/g, ' ').trim());
      if (/SELECT id, estado FROM historial_remisiones/.test(sql)) {
        return [[{ id: 20, estado: 'FINALIZADO' }], []];
      }
      assert.fail(`unexpected write: ${sql}`);
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({ async getConnection() { return connection; } }));
  const token = jwt.sign({ id: 1, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);

  const response = await request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo_factura', Buffer.from(
      'REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO\nR-8,SKU-1,Producto,1,2\n'
    ), { filename: 'reimport.csv', contentType: 'text/csv' });

  assert.equal(response.status, 409, response.text);
  assert.match(response.body.error, /finaliz/i);
  assert.equal(events.some((event) => typeof event === 'string' && /^(UPDATE|INSERT|DELETE)/.test(event)), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});

test('reimporting a pending XML updates only invoice fields and preserves physical/manual adjustments', async () => {
  const events = [];
  const writes = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(normalized);
      if (/SELECT id, estado FROM historial_remisiones/.test(normalized)) {
        return [[{ id: 20, estado: 'PENDIENTE' }], []];
      }
      if (/SELECT proveedor FROM historial_remisiones WHERE id = \? LIMIT 1/.test(normalized)) {
        return [[{ proveedor: 'TONY' }], []];
      }
      if (/UPDATE historial_remisiones SET fecha_carga = NOW\(\), proveedor = \? WHERE id = \?/.test(normalized)) {
        writes.push([normalized, params]);
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT id FROM historial_items WHERE remision_id = \? AND codigo_proveedor = \? LIMIT 1/.test(normalized)) {
        return [[{ id: 77 }], []];
      }
      if (/SELECT descripcion_original, cantidad, costo_unitario, aplica_iva, iva_tasa, costo_incluye_iva, aplica_descuento FROM historial_items WHERE id = \? LIMIT 1/.test(normalized)) {
        return [[{
          descripcion_original: 'Producto anterior',
          cantidad: 1,
          costo_unitario: 9,
          aplica_iva: 1,
          iva_tasa: 0.16,
          costo_incluye_iva: 1,
          aplica_descuento: 0
        }], []];
      }
      if (/UPDATE historial_items SET/.test(normalized)) {
        writes.push([normalized, params]);
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO recepcion_bitacora/i.test(normalized)) {
        writes.push([normalized, params]);
        return [{ insertId: 78 }, []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({ async getConnection() { return connection; } }));
  const token = jwt.sign({ id: 1, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);

  const response = await request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo_factura', Buffer.from(
      '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="urn:cfdi" Serie="R" Folio="8"><cfdi:Emisor Rfc="TTI961202IM1" Nombre="Tony"/><cfdi:Conceptos><cfdi:Concepto NoIdentificacion="SKU-1" Descripcion="Producto XML" Cantidad="2" ValorUnitario="10" Descuento="1"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" TasaOCuota="0.160000" /></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos></cfdi:Comprobante>'
    ), { filename: 'reimport.xml', contentType: 'application/xml' });

  assert.equal(response.status, 200, response.text);
  const itemUpdate = writes.find(([sql]) => /UPDATE historial_items SET/.test(sql));
  assert.ok(itemUpdate, 'expected item update');
  assert.match(itemUpdate[0], /descripcion_original=\?, cantidad=\?, costo_unitario=\?, aplica_iva=\?, iva_tasa=\?, costo_incluye_iva=\?, aplica_descuento=\? WHERE id=\?/);
  assert.doesNotMatch(itemUpdate[0], /existencia_lapiz|aplica_descuento_manual|es_paquete|piezas_por_paquete/);
  assert.deepEqual(itemUpdate[1], ['Producto XML', 2, 11.6, 0, 0.16, 1, 1, 77]);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

test('reimporting a pending XML records provider and changed invoice fields in recepcion_bitacora', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(['execute', normalized, params]);
      if (/SELECT id, estado FROM historial_remisiones/.test(normalized)) {
        return [[{ id: 20, estado: 'PENDIENTE', proveedor: 'MANUAL' }], []];
      }
      if (/SELECT proveedor FROM historial_remisiones WHERE id = \? LIMIT 1/.test(normalized)) {
        return [[{ proveedor: 'MANUAL' }], []];
      }
      if (/UPDATE historial_remisiones SET fecha_carga = NOW\(\), proveedor = \? WHERE id = \?/.test(normalized)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT id FROM historial_items WHERE remision_id = \? AND codigo_proveedor = \? LIMIT 1/.test(normalized)) {
        return [[{
          id: 77,
          descripcion_original: 'Producto anterior',
          cantidad: 1,
          costo_unitario: 9,
          aplica_iva: 1,
          iva_tasa: 0.16,
          costo_incluye_iva: 1,
          aplica_descuento: 0
        }], []];
      }
      if (/SELECT descripcion_original, cantidad, costo_unitario, aplica_iva, iva_tasa, costo_incluye_iva, aplica_descuento FROM historial_items WHERE id = \? LIMIT 1/.test(normalized)) {
        return [[{
          descripcion_original: 'Producto anterior',
          cantidad: 1,
          costo_unitario: 9,
          aplica_iva: 1,
          iva_tasa: 0.16,
          costo_incluye_iva: 1,
          aplica_descuento: 0
        }], []];
      }
      if (/UPDATE historial_items SET/.test(normalized)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO recepcion_bitacora/i.test(normalized)) {
        return [{ insertId: 80 }, []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({ async getConnection() { return connection; } }));
  const token = jwt.sign({ id: 15, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);

  const response = await request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo_factura', Buffer.from(
      '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="urn:cfdi" Serie="R" Folio="8"><cfdi:Emisor Rfc="TTI961202IM1" Nombre="Tony"/><cfdi:Conceptos><cfdi:Concepto NoIdentificacion="SKU-1" Descripcion="Producto XML" Cantidad="2" ValorUnitario="10" Descuento="1"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" TasaOCuota="0.160000" /></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos></cfdi:Comprobante>'
    ), { filename: 'reimport-audit.xml', contentType: 'application/xml' });

  assert.equal(response.status, 200, response.text);
  const auditStatements = events.filter((event) => Array.isArray(event) && /INSERT INTO recepcion_bitacora/i.test(event[1]));
  assert.ok(auditStatements.length >= 2, `expected audit rows alongside reimport updates: ${JSON.stringify(events)}`);
  assert.ok(
    auditStatements.some(([, , params]) => JSON.stringify(params) === JSON.stringify([20, null, 15, 'proveedor', 'MANUAL', 'TONY'])),
    `missing provider audit row in ${JSON.stringify(auditStatements)}`
  );
  assert.ok(
    auditStatements.some(([, , params]) => JSON.stringify(params) === JSON.stringify([20, 77, 15, 'cantidad', '1', '2'])),
    `missing quantity audit row in ${JSON.stringify(auditStatements)}`
  );
  const itemUpdateIndex = events.findIndex((event) => Array.isArray(event) && /UPDATE historial_items SET/.test(event[1]));
  const quantityAuditIndex = events.findIndex(
    (event) => Array.isArray(event)
      && /INSERT INTO recepcion_bitacora/i.test(event[1])
      && JSON.stringify(event[2]) === JSON.stringify([20, 77, 15, 'cantidad', '1', '2'])
  );
  assert.notEqual(itemUpdateIndex, -1);
  assert.notEqual(quantityAuditIndex, -1);
  assert.ok(quantityAuditIndex > itemUpdateIndex, `expected quantity audit after item update in same transaction: ${JSON.stringify(events)}`);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

test('new XML items persist detected IVA and concept discount flags', async () => {
  const writes = [];
  const connection = {
    async beginTransaction() {},
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (/SELECT id, estado FROM historial_remisiones/.test(normalized)) {
        return [[{ id: 33, estado: 'PENDIENTE' }], []];
      }
      if (/SELECT proveedor FROM historial_remisiones WHERE id = \? LIMIT 1/.test(normalized)) {
        return [[{ proveedor: 'TONY' }], []];
      }
      if (/UPDATE historial_remisiones SET fecha_carga = NOW\(\), proveedor = \? WHERE id = \?/.test(normalized)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT id FROM historial_items WHERE remision_id = \? AND codigo_proveedor = \? LIMIT 1/.test(normalized)) {
        return [[], []];
      }
      if (/INSERT INTO historial_items/.test(normalized)) {
        writes.push([normalized, params]);
        return [{ insertId: 90 }, []];
      }
      if (/INSERT INTO recepcion_bitacora/i.test(normalized)) {
        writes.push([normalized, params]);
        return [{ insertId: 91 }, []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({ async getConnection() { return connection; } }));
  const token = jwt.sign({ id: 1, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);

  const response = await request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo_factura', Buffer.from(
      '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="urn:cfdi" Serie="N" Folio="3"><cfdi:Emisor Rfc="TTI961202IM1" Nombre="Tony"/><cfdi:Conceptos><cfdi:Concepto NoIdentificacion="SKU-9" Descripcion="Nuevo" Cantidad="4" ValorUnitario="25" Descuento="1"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" TasaOCuota="0.160000" /></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos></cfdi:Comprobante>'
    ), { filename: 'nuevo.xml', contentType: 'application/xml' });

  assert.equal(response.status, 200, response.text);
  const itemInsert = writes.find(([sql]) => /INSERT INTO historial_items/.test(sql));
  assert.ok(itemInsert, `missing inserted item write: ${JSON.stringify(writes)}`);
  assert.match(itemInsert[0], /aplica_iva, iva_tasa, costo_incluye_iva, aplica_descuento\) VALUES \(\?, \?, \?, \?, \?, 0, 0, 1, \?, \?, \?, \?\)/);
  assert.deepEqual(itemInsert[1], [33, 'SKU-9', 'Nuevo', 4, 29, 0, 0.16, 1, 1]);
});

test('reimporting a pending XML with a new provider code writes recepcion_bitacora for the inserted item', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(['execute', normalized, params]);
      if (/SELECT id, estado FROM historial_remisiones/.test(normalized)) {
        return [[{ id: 33, estado: 'PENDIENTE' }], []];
      }
      if (/SELECT proveedor FROM historial_remisiones WHERE id = \? LIMIT 1/.test(normalized)) {
        return [[{ proveedor: 'TONY' }], []];
      }
      if (/UPDATE historial_remisiones SET fecha_carga = NOW\(\), proveedor = \? WHERE id = \?/.test(normalized)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT id FROM historial_items WHERE remision_id = \? AND codigo_proveedor = \? LIMIT 1/.test(normalized)) {
        return [[], []];
      }
      if (/INSERT INTO historial_items/.test(normalized)) {
        return [{ insertId: 190 }, []];
      }
      if (/INSERT INTO recepcion_bitacora/i.test(normalized)) {
        return [{ insertId: 191 }, []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({ async getConnection() { return connection; } }));
  const token = jwt.sign({ id: 27, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);

  const response = await request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo_factura', Buffer.from(
      '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="urn:cfdi" Serie="N" Folio="3"><cfdi:Emisor Rfc="TTI961202IM1" Nombre="Tony"/><cfdi:Conceptos><cfdi:Concepto NoIdentificacion="SKU-NUEVO-AUDIT" Descripcion="Nuevo auditado" Cantidad="4" ValorUnitario="25" Descuento="1"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" TasaOCuota="0.160000" /></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos></cfdi:Comprobante>'
    ), { filename: 'nuevo-audit.xml', contentType: 'application/xml' });

  assert.equal(response.status, 200, response.text);
  const insertIndex = events.findIndex((event) => Array.isArray(event) && /INSERT INTO historial_items/i.test(event[1]));
  const auditStatement = events.find((event) => Array.isArray(event)
    && /INSERT INTO recepcion_bitacora/i.test(event[1])
    && JSON.stringify(event[2]) === JSON.stringify([33, 190, 27, 'cantidad', null, '4']));
  assert.notEqual(insertIndex, -1);
  assert.ok(auditStatement, `missing inserted-item audit row: ${JSON.stringify(events)}`);
  const auditIndex = events.findIndex((event) => event === auditStatement);
  assert.ok(auditIndex > insertIndex, `expected new-item audit after insert in same transaction: ${JSON.stringify(events)}`);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

test('persisted XML cost stays IVA-included after reload instead of being taxed twice', async () => {
  let persistedItem;
  const connection = {
    async beginTransaction() {},
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (/SELECT id, estado FROM historial_remisiones/.test(normalized)) {
        return [[{ id: 51, estado: 'PENDIENTE' }], []];
      }
      if (/SELECT proveedor FROM historial_remisiones WHERE id = \? LIMIT 1/.test(normalized)) {
        return [[{ proveedor: 'TONY' }], []];
      }
      if (/UPDATE historial_remisiones SET fecha_carga = NOW\(\), proveedor = \? WHERE id = \?/.test(normalized)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT id FROM historial_items WHERE remision_id = \? AND codigo_proveedor = \? LIMIT 1/.test(normalized)) {
        return [[], []];
      }
      if (/INSERT INTO historial_items/.test(normalized)) {
        persistedItem = {
          costo_unitario: params[4],
          aplica_iva: params[5],
          iva_tasa: params[6],
          costo_incluye_iva: params[7],
          aplica_descuento: params[8],
          proveedor: 'TONY'
        };
        return [{ insertId: 91 }, []];
      }
      if (/INSERT INTO recepcion_bitacora/i.test(normalized)) {
        return [{ insertId: 92 }, []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  const app = express();
  app.use('/api/recepciones', loadRouterWithDatabase({ async getConnection() { return connection; } }));
  const token = jwt.sign({ id: 1, rol: 'admin', permisos: ['recepciones'] }, jwtSecret);

  const response = await request(app)
    .post('/api/recepciones/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo_factura', Buffer.from(
      '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="urn:cfdi" Serie="I" Folio="7"><cfdi:Emisor Rfc="TTI961202IM1" Nombre="Tony"/><cfdi:Conceptos><cfdi:Concepto NoIdentificacion="SKU-IVA" Descripcion="IVA incluido" Cantidad="1" ValorUnitario="25"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" TasaOCuota="0.160000" /></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos></cfdi:Comprobante>'
    ), { filename: 'persisted.xml', contentType: 'application/xml' });

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(
    calculateCost({
      costoUnitario: persistedItem.costo_unitario,
      aplica_iva: persistedItem.aplica_iva,
      iva_tasa: persistedItem.iva_tasa,
      costoIncluyeIva: persistedItem.costo_incluye_iva,
      aplica_descuento: persistedItem.aplica_descuento,
      proveedor: persistedItem.proveedor
    }),
    {
      costoBase: 29,
      costoConIva: 29,
      costoFinal: 29,
      costoPorPieza: 29,
      iva: { detectado: true, porcentaje: 0.16, aplicado: false, yaIncluido: true },
      descuento: { aplica: false, porcentaje: 0, origen: 'xml' }
    }
  );
});
