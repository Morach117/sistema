const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { completeTraspaso } = require('../../services/traspasos-service');

function transactionPool(results) {
  const events = [];
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

  return {
    events,
    async getConnection() { return connection; }
  };
}

test('rolls back when a detail does not belong to its transfer', async () => {
  const pool = transactionPool([
    [[{ id: 4 }], []],
    [[{ id: 9 }], []],
    [{ affectedRows: 0 }, []]
  ]);

  await assert.rejects(
    () => completeTraspaso({
      pool,
      traspasoId: 4,
      detalles: [{ id: 9, cantidad_recibida: 2 }],
      actorId: 1
    }),
    (error) => error.statusCode === 409 && /detalle/i.test(error.message)
  );

  assert.equal(pool.events.includes('rollback'), true);
  assert.equal(pool.events.includes('commit'), false);
  assert.deepEqual(pool.events.at(-1), 'release');
  assert.match(pool.events[2][1], /SELECT id FROM traspaso_detalles.*FOR UPDATE/i);
  assert.deepEqual(pool.events[3], [
    'execute',
    'UPDATE traspaso_detalles SET cantidad = ? WHERE id = ? AND traspaso_id = ?',
    [2, 9, 4]
  ]);
});

test('locks a pending transfer and commits only after every detail and header update match', async () => {
  const pool = transactionPool([
    [[{ id: 4 }], []],
    [[{ id: 9 }, { id: 10 }], []],
    [{ affectedRows: 1 }, []],
    [{ affectedRows: 1 }, []],
    [{ affectedRows: 1 }, []]
  ]);

  await completeTraspaso({
    pool,
    traspasoId: 4,
    detalles: [
      { id: 9, cantidad_recibida: '2.5' },
      { id: 10, cantidad_recibida: 1 }
    ],
    actorId: 1
  });

  assert.deepEqual(pool.events, [
    'begin',
    ['execute', "SELECT id FROM traspasos WHERE id = ? AND estado = 'PENDIENTE' FOR UPDATE", [4]],
    ['execute', 'SELECT id FROM traspaso_detalles WHERE traspaso_id = ? ORDER BY id FOR UPDATE', [4]],
    ['execute', 'UPDATE traspaso_detalles SET cantidad = ? WHERE id = ? AND traspaso_id = ?', [2.5, 9, 4]],
    ['execute', 'UPDATE traspaso_detalles SET cantidad = ? WHERE id = ? AND traspaso_id = ?', [1, 10, 4]],
    ['execute', "UPDATE traspasos SET estado = 'COMPLETADO' WHERE id = ? AND estado = 'PENDIENTE'", [4]],
    'commit',
    'release'
  ]);
});

test('rejects non-positive received quantities before acquiring a connection', async () => {
  const pool = transactionPool([
    [[{ id: 4 }], []],
    [[{ id: 9 }], []]
  ]);

  await assert.rejects(
    () => completeTraspaso({
      pool,
      traspasoId: 4,
      detalles: [{ id: 9, cantidad_recibida: 0 }],
      actorId: 1
    }),
    (error) => error.statusCode === 422 && /cantidad/i.test(error.message)
  );

  assert.deepEqual(pool.events, []);
});

test('rejects completion unless submitted unique detail IDs exactly match persisted lines', async () => {
  const pool = transactionPool([
    [[{ id: 4 }], []],
    [[{ id: 9 }, { id: 10 }], []]
  ]);

  await assert.rejects(
    () => completeTraspaso({
      pool,
      traspasoId: 4,
      detalles: [{ id: 9, cantidad_recibida: 2 }],
      actorId: 1
    }),
    (error) => error.statusCode === 409 && /detalle|linea/i.test(error.message)
  );
  assert.equal(pool.events.some((event) => Array.isArray(event) && /^UPDATE/.test(event[1])), false);
  assert.deepEqual(pool.events.slice(-2), ['rollback', 'release']);
});

test('rejects duplicate submitted detail IDs before acquiring a connection', async () => {
  await assert.rejects(
    () => completeTraspaso({
      pool: { async getConnection() { assert.fail('database access'); } },
      traspasoId: 4,
      detalles: [
        { id: 9, cantidad_recibida: 2 },
        { id: 9, cantidad_recibida: 3 }
      ],
      actorId: 1
    }),
    (error) => error.statusCode === 422 && /duplic/i.test(error.message)
  );
});

test('rejects boolean received quantities instead of coercing them to one', async () => {
  const pool = transactionPool([
    [[{ id: 4 }], []],
    [[{ id: 9 }], []]
  ]);

  await assert.rejects(
    () => completeTraspaso({
      pool,
      traspasoId: 4,
      detalles: [{ id: 9, cantidad_recibida: true }],
      actorId: 1
    }),
    (error) => error.statusCode === 422 && /cantidad/i.test(error.message)
  );
  assert.deepEqual(pool.events, []);
});

for (const quantity of ['100000000', '1.001', 100000000, 1.001]) {
  test(`rejects non-DECIMAL(10,2) received quantity ${quantity} before DB`, async () => {
    await assert.rejects(
      () => completeTraspaso({
        pool: { async getConnection() { assert.fail('database access'); } },
        traspasoId: 4,
        detalles: [{ id: 9, cantidad_recibida: quantity }],
        actorId: 1
      }),
      (error) => error.statusCode === 422 && /cantidad/i.test(error.message)
    );
  });
}

test('versioned transfer detail DDL declares cantidad as the persistence column', async () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../database/migraciones/001_crear_tablas_traspasos.sql'
  );
  const ddl = await fs.readFile(migrationPath, 'utf8');
  const detailTable = ddl.match(
    /CREATE TABLE IF NOT EXISTS `traspaso_detalles` \(([\s\S]*?)\) COLLATE/
  );

  assert.ok(detailTable, 'versioned DDL must declare traspaso_detalles');
  assert.match(detailTable[1], /`cantidad` DECIMAL\(10,2\) NOT NULL/);
  assert.doesNotMatch(detailTable[1], /`cantidad_recibida`/);
});
