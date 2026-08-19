const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { request } = require('../helpers/app');

const jwtSecret = 'reclamaciones-rectificacion-test-secret';
process.env.JWT_SECRET = jwtSecret;

const database = require('../../config/database');
const reclamacionesRouter = require('../../routes/reclamaciones');

function authToken({ admin = false } = {}) {
  return jwt.sign({
    id: 23,
    rol: admin ? 'admin' : 'empleado',
    permisos: ['reclamaciones']
  }, jwtSecret);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/reclamaciones', reclamacionesRouter);
  return app;
}

test('recount only updates queued items from receptions that are not finalized', async () => {
  const originalExecute = database.execute;
  const calls = [];
  database.execute = async (statement, parameters) => {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    calls.push([normalized, parameters]);
    if (/UPDATE historial_items hi INNER JOIN historial_remisiones hr/i.test(normalized)) {
      return [{ affectedRows: 1 }, []];
    }
    if (/INSERT INTO logs_auditoria/i.test(normalized)) return [{ insertId: 7 }, []];
    assert.fail(`unexpected SQL: ${normalized}`);
  };

  try {
    const response = await request(buildApp())
      .post('/api/reclamaciones/recontar')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ id_item: 12, nuevo_valor: 8 });

    assert.equal(response.status, 200, response.text);
    assert.match(calls[0][0], /hi\.revision_pendiente = 2/);
    assert.match(calls[0][0], /hr\.estado <> 'FINALIZADO'/);
    assert.deepEqual(calls[0][1], [8, 12]);
  } finally {
    database.execute = originalExecute;
  }
});

test('recount rejects invalid quantities before touching the database', async () => {
  const originalExecute = database.execute;
  database.execute = async () => assert.fail('invalid recount must not reach the database');

  try {
    const response = await request(buildApp())
      .post('/api/reclamaciones/recontar')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ id_item: 12, nuevo_valor: -1 });

    assert.equal(response.status, 422, response.text);
  } finally {
    database.execute = originalExecute;
  }
});

test('only an administrator can release a queued item and finalized receptions stay locked', async () => {
  const originalExecute = database.execute;
  const calls = [];
  database.execute = async (statement, parameters) => {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    calls.push([normalized, parameters]);
    if (/UPDATE historial_items hi INNER JOIN historial_remisiones hr/i.test(normalized)) {
      return [{ affectedRows: 0 }, []];
    }
    assert.fail(`unexpected SQL: ${normalized}`);
  };

  try {
    const response = await request(buildApp())
      .post('/api/reclamaciones/validar')
      .set('Authorization', `Bearer ${authToken({ admin: true })}`)
      .send({ id_item: 12 });

    assert.equal(response.status, 409, response.text);
    assert.match(calls[0][0], /hi\.revision_pendiente = 2/);
    assert.match(calls[0][0], /hr\.estado <> 'FINALIZADO'/);
  } finally {
    database.execute = originalExecute;
  }
});
