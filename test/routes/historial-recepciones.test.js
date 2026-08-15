const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { request } = require('../helpers/app');

const jwtSecret = 'historial-recepciones-test-secret-32-characters';
process.env.JWT_SECRET = jwtSecret;

function loadHistoryRouterWithDatabase(database) {
  const databasePath = require.resolve('../../config/database');
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: database
  };
  const routePath = require.resolve('../../routes/historial-recepciones');
  delete require.cache[routePath];
  return require('../../routes/historial-recepciones');
}

function buildApp(database) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/historial-recepciones', loadHistoryRouterWithDatabase(database));
  return app;
}

function authToken({ rol = 'empleado', permisos = ['historial-recepciones'] } = {}) {
  return jwt.sign({ id: 7, rol, permisos }, jwtSecret);
}

test('lists reception history with bounded pagination and parameterized filters for read-only users', async () => {
  const executed = [];
  const app = buildApp({
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      executed.push([normalized, params]);

      if (/SELECT COUNT\(\*\) AS total FROM historial_remisiones hr/i.test(normalized)) {
        return [[{ total: 145 }], []];
      }
      if (/SELECT hr\.id, hr\.numero_remision, hr\.proveedor, hr\.fecha_carga, hr\.estado/i.test(normalized)) {
        return [[{
          id: 44,
          numero_remision: 'R-44',
          proveedor: 'TONY',
          fecha_carga: '2026-08-10 12:00:00',
          estado: 'FINALIZADO',
          items: 3
        }], []];
      }

      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async getConnection() {
      assert.fail('listing must not open a write transaction');
    }
  });

  const response = await request(app)
    .get('/api/historial-recepciones?page=2&limit=250&fecha_desde=2026-08-01&fecha_hasta=2026-08-15&proveedor=TONY&estado=finalizado&folio=R-44&producto=lapiz')
    .set('Authorization', `Bearer ${authToken()}`);

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.paginacion, {
    pagina: 2,
    limite: 100,
    total: 145,
    totalPaginas: 2
  });
  assert.equal(response.body.data[0].numero_remision, 'R-44');
  assert.equal(response.body.data[0].estado, 'FINALIZADO');
  assert.deepEqual(executed.at(-1)[1].slice(-2), [100, 100]);
  assert.ok(executed[0][1].includes('2026-08-01'));
  assert.ok(executed[0][1].includes('2026-08-15'));
  assert.ok(executed[0][1].includes('TONY'));
  assert.ok(executed[0][1].includes('FINALIZADO'));
  assert.ok(executed[0][1].includes('%R-44%'));
  assert.ok(executed[0][1].includes('%lapiz%'));
});

test('allows detail reads for historial-only users but denies export and edits before database access', async () => {
  const events = [];
  const app = buildApp({
    async execute(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(['execute', normalized]);
      if (/SELECT hr\.id, hr\.numero_remision, hr\.proveedor, hr\.fecha_carga, hr\.estado/i.test(normalized)) {
        return [[{
          id: 9,
          numero_remision: 'F-9',
          proveedor: 'TONY',
          fecha_carga: '2026-08-10 12:00:00',
          estado: 'FINALIZADO',
          items: 1
        }], []];
      }
      if (/SELECT hi\.\*,/i.test(normalized)) {
        return [[{
          id: 91,
          codigo_proveedor: 'SKU-9',
          descripcion_original: 'Lapiz rojo',
          cantidad: 12,
          costo_unitario: 5.5,
          existencia_lapiz: 12,
          es_paquete: 0,
          piezas_por_paquete: 1,
          clave_final: 'ABC123',
          clave_sicar: 'ABC123',
          aplica_iva: 0,
          iva_tasa: null,
          costo_incluye_iva: 0,
          aplica_descuento: 0,
          aplica_descuento_manual: 0,
          revision_pendiente: 0,
          costo_bd: 5.5,
          venta_bd: 8.5,
          desc_bd: 'Lapiz rojo',
          clave_catalogo: 'ABC123',
          clave_memoria: 'ABC123',
          es_paquete_mem: 0,
          piezas_mem: 1
        }], []];
      }
      if (/FROM recepcion_notas n/i.test(normalized)) return [[[]], []];
      if (/FROM recepcion_bitacora b/i.test(normalized)) return [[[]], []];
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async getConnection() {
      events.push(['connection']);
      assert.fail('read-only detail should not use a write connection');
    }
  });

  const token = authToken();
  const [detailResponse, exportResponse, updateResponse, noteResponse] = await Promise.all([
    request(app).get('/api/historial-recepciones/9').set('Authorization', `Bearer ${token}`),
    request(app).get('/api/historial-recepciones/9/excel').set('Authorization', `Bearer ${token}`),
    request(app)
      .post('/api/historial-recepciones/actualizar_campo')
      .set('Authorization', `Bearer ${token}`)
      .send({ id_item: 91, campo: 'cantidad', valor: 14 }),
    request(app)
      .post('/api/historial-recepciones/9/notas')
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 'Solo lectura' })
  ]);

  assert.equal(detailResponse.status, 200, detailResponse.text);
  assert.equal(exportResponse.status, 403);
  assert.equal(updateResponse.status, 403);
  assert.equal(noteResponse.status, 403);
  assert.equal(events.some(([kind]) => kind === 'connection'), false);
});

test('returns finalized history detail as strictly read-only with notes and audit old/new values', async () => {
  const app = buildApp({
    async execute(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (/SELECT hr\.id, hr\.numero_remision, hr\.proveedor, hr\.fecha_carga, hr\.estado/i.test(normalized)) {
        return [[{
          id: 9,
          numero_remision: 'F-9',
          proveedor: 'TONY',
          fecha_carga: '2026-08-10 12:00:00',
          estado: 'FINALIZADO',
          items: 1
        }], []];
      }
      if (/SELECT hi\.\*,/i.test(normalized)) {
        return [[{
          id: 91,
          codigo_proveedor: 'SKU-9',
          descripcion_original: 'Lapiz rojo',
          cantidad: 12,
          costo_unitario: 5.5,
          existencia_lapiz: 12,
          es_paquete: 0,
          piezas_por_paquete: 1,
          clave_final: 'ABC123',
          clave_sicar: 'ABC123',
          aplica_iva: 0,
          iva_tasa: null,
          costo_incluye_iva: 0,
          aplica_descuento: 0,
          aplica_descuento_manual: 0,
          revision_pendiente: 0,
          costo_bd: 5.5,
          venta_bd: 8.5,
          desc_bd: 'Lapiz rojo',
          clave_catalogo: 'ABC123',
          clave_memoria: 'ABC123',
          es_paquete_mem: 0,
          piezas_mem: 1
        }], []];
      }
      if (/FROM recepcion_notas n/i.test(normalized)) {
        return [[{
          id: 3,
          remision_id: 9,
          item_id: null,
          nota: 'Conteo revisado',
          usuario_id: 5,
          usuario: 'Julia',
          fecha: '2026-08-11 10:00:00'
        }], []];
      }
      if (/FROM recepcion_bitacora b/i.test(normalized)) {
        return [[{
          id: 4,
          remision_id: 9,
          item_id: 91,
          usuario_id: 5,
          usuario: 'Julia',
          campo: 'cantidad',
          valor_anterior: '10',
          valor_nuevo: '12',
          fecha: '2026-08-11 10:01:00'
        }], []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async getConnection() {
      assert.fail('detail must not open a write transaction');
    }
  });

  const response = await request(app)
    .get('/api/historial-recepciones/9')
    .set('Authorization', `Bearer ${authToken()}`);

  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.remision.estado, 'FINALIZADO');
  assert.deepEqual(response.body.permisos, {
    soloLectura: true,
    puedeEditar: false,
    puedeExportar: false
  });
  assert.equal(response.body.notas[0].nota, 'Conteo revisado');
  assert.deepEqual(response.body.bitacora[0], {
    id: 4,
    remision_id: 9,
    item_id: 91,
    usuario_id: 5,
    usuario: 'Julia',
    campo: 'cantidad',
    valor_anterior: '10',
    valor_nuevo: '12',
    fecha: '2026-08-11 10:01:00'
  });
});

test('admin adds a pending history note and writes the note audit in the same transaction', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(['execute', normalized, params]);
      if (/SELECT id, estado, numero_remision FROM historial_remisiones WHERE id = \? FOR UPDATE/i.test(normalized)) {
        return [[{ id: 12, estado: 'PENDIENTE', numero_remision: 'P-12' }], []];
      }
      if (/SELECT id FROM historial_items WHERE id = \? AND remision_id = \? FOR UPDATE/i.test(normalized)) {
        return [[{ id: 91 }], []];
      }
      if (/INSERT INTO recepcion_notas/i.test(normalized)) {
        return [{ insertId: 70 }, []];
      }
      if (/INSERT INTO recepcion_bitacora/i.test(normalized)) {
        return [{ insertId: 71 }, []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const app = buildApp({
    async execute() {
      assert.fail('note creation must use the write connection');
    },
    async getConnection() {
      return connection;
    }
  });

  const response = await request(app)
    .post('/api/historial-recepciones/12/notas')
    .set('Authorization', `Bearer ${authToken({ rol: 'admin', permisos: ['historial-recepciones', 'recepciones'] })}`)
    .send({ item_id: 91, nota: 'Revisar piezas por caja' });

  assert.equal(response.status, 200, response.text);
  const auditStatement = events.find((event) => Array.isArray(event) && /INSERT INTO recepcion_bitacora/i.test(event[1]));
  assert.deepEqual(auditStatement[2], [12, 91, 7, 'nota', null, 'Revisar piezas por caja']);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

test('admin cannot export a finalized remision from history', async () => {
  const app = buildApp({
    async execute(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (/SELECT id, numero_remision, estado FROM historial_remisiones WHERE id = \? LIMIT 1/i.test(normalized)) {
        return [[{ id: 99, numero_remision: 'FIN-99', estado: 'FINALIZADO' }], []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    },
    async getConnection() {
      assert.fail('export must not open a write transaction');
    }
  });

  const response = await request(app)
    .get('/api/historial-recepciones/99/excel')
    .set('Authorization', `Bearer ${authToken({ rol: 'admin', permisos: ['historial-recepciones', 'recepciones'] })}`);

  assert.equal(response.status, 409, response.text);
  assert.match(response.body.error, /solo lectura|finaliz/i);
});

for (const estado of ['ENVIADO', 'REVISION']) {
  test(`admin history actions stay read-only when the remision is ${estado}`, async () => {
    const events = [];
    const connection = {
      async beginTransaction() { events.push('begin'); },
      async execute(sql, params) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        events.push(['execute', normalized, params]);
        if (/SELECT id, estado, numero_remision FROM historial_remisiones WHERE id = \? FOR UPDATE/i.test(normalized)) {
          return [[{ id: 21, estado, numero_remision: `R-${estado}` }], []];
        }
        if (/SELECT hi\.id, hi\.remision_id, hr\.estado/i.test(normalized)) {
          return [[{ id: 91, remision_id: 21, estado, current_value: 12 }], []];
        }
        assert.fail(`unexpected SQL: ${normalized}`);
      },
      async commit() { events.push('commit'); },
      async rollback() { events.push('rollback'); },
      release() { events.push('release'); }
    };
    const app = buildApp({
      async execute(sql, params) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        events.push(['read', normalized, params]);
        if (/SELECT id, numero_remision, estado FROM historial_remisiones WHERE id = \? LIMIT 1/i.test(normalized)) {
          return [[{ id: 21, numero_remision: `R-${estado}`, estado }], []];
        }
        assert.fail(`unexpected SQL: ${normalized}`);
      },
      async getConnection() {
        return connection;
      }
    });

    const token = authToken({ rol: 'admin', permisos: ['historial-recepciones', 'recepciones'] });
    const [exportResponse, noteResponse, updateResponse] = await Promise.all([
      request(app)
        .get('/api/historial-recepciones/21/excel')
        .set('Authorization', `Bearer ${token}`),
      request(app)
        .post('/api/historial-recepciones/21/notas')
        .set('Authorization', `Bearer ${token}`)
        .send({ nota: `bloqueada-${estado}` }),
      request(app)
        .post('/api/historial-recepciones/actualizar_campo')
        .set('Authorization', `Bearer ${token}`)
        .send({ id_item: 91, campo: 'cantidad', valor: 14 })
    ]);

    assert.equal(exportResponse.status, 403, exportResponse.text);
    assert.equal(noteResponse.status, 403, noteResponse.text);
    assert.equal(updateResponse.status, 403, updateResponse.text);
    assert.equal(
      events.some((event) => Array.isArray(event) && /INSERT INTO recepcion_notas|INSERT INTO recepcion_bitacora|UPDATE historial_items/i.test(event[1])),
      false
    );
  });
}
