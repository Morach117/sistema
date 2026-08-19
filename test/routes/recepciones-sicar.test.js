const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { request } = require('../helpers/app');

const jwtSecret = 'recepciones-sicar-test-secret-32-characters';
process.env.JWT_SECRET = jwtSecret;

const database = require('../../config/database');
const recepcionesRouter = require('../../routes/recepciones');

function authToken({ rol = 'empleado' } = {}) {
  return jwt.sign({ id: 17, rol, permisos: ['recepciones'] }, jwtSecret);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/recepciones', recepcionesRouter);
  return app;
}

test('reception users can validate an exact SICAR without catalog permission', async () => {
  const originalExecute = database.execute;
  const calls = [];
  database.execute = async (statement, parameters) => {
    calls.push([statement.replace(/\s+/g, ' ').trim(), parameters]);
    return [[{
      clave_sicar: '7502269634659',
      codigo_barras: '7502269634659',
      descripcion: 'ABACO PLAST CH BOLSA JOCAR'
    }], []];
  };

  try {
    const response = await request(buildApp())
      .get('/api/recepciones/catalogo-exacto?code=7502269634659')
      .set('Authorization', `Bearer ${authToken()}`);

    assert.equal(response.status, 200, response.text);
    assert.deepEqual(response.body, {
      data: {
        clave_sicar: '7502269634659',
        codigo_barras: '7502269634659',
        descripcion: 'ABACO PLAST CH BOLSA JOCAR'
      }
    });
    assert.match(calls[0][0], /SELECT clave_sicar, codigo_barras, descripcion FROM cat_productos/);
    assert.deepEqual(calls[0][1], ['7502269634659', '7502269634659']);
  } finally {
    database.execute = originalExecute;
  }
});

test('reception users can send a pending item to rectification and create an audit entry', async () => {
  const originalExecute = database.execute;
  const calls = [];
  database.execute = async (statement, parameters) => {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    calls.push([normalized, parameters]);
    if (/UPDATE historial_items hi INNER JOIN historial_remisiones hr/i.test(normalized)) {
      return [{ affectedRows: 1 }, []];
    }
    if (/INSERT INTO logs_auditoria/i.test(normalized)) {
      return [{ insertId: 91 }, []];
    }
    assert.fail(`unexpected SQL: ${normalized}`);
  };

  try {
    const response = await request(buildApp())
      .post('/api/recepciones/enviar-a-rectificar')
      .set('Authorization', `Bearer ${authToken({ rol: 'admin' })}`)
      .send({ id_item: 44 });

    assert.equal(response.status, 200, response.text);
    assert.deepEqual(response.body, { success: true });
    assert.match(calls[0][0], /SET hi\.revision_pendiente = 2/);
    assert.deepEqual(calls[0][1], [44]);
    assert.deepEqual(calls[1][1], [17, 'ENVIAR_A_RECTIFICAR', 'Artículo de recepción enviado a rectificación: 44']);
  } finally {
    database.execute = originalExecute;
  }
});

test('the generic reception editor cannot clear a rectification hold', async () => {
  const originalExecute = database.execute;
  database.execute = async () => assert.fail('the rejected field must not reach the database');

  try {
    const response = await request(buildApp())
      .post('/api/recepciones/actualizar_campo')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ id_item: 44, campo: 'revision_pendiente', valor: 0 });

    assert.equal(response.status, 400, response.text);
    assert.deepEqual(response.body, { success: false, error: 'Campo no permitido' });
  } finally {
    database.execute = originalExecute;
  }
});
