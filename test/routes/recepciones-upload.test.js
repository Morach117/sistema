const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { request } = require('../helpers/app');

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
