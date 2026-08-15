const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const jwtSecret = 'test-secret-that-is-at-least-32-characters';
process.env.JWT_SECRET = jwtSecret;
const { createApp } = require('../../app');
const { request } = require('../helpers/app');
const { savePermissions } = require('../../routes/usuarios');
const { createAuthRouter, createLoginLimiter } = require('../../routes/auth');

test('rejects unauthenticated Excel exports', async () => {
  const bodyToken = jwt.sign({ id: 7, rol: 'admin', permisos: [] }, jwtSecret);
  const responses = await Promise.all([
    request(createApp()).post('/api/recepciones/generar_excel').send({ id: 1 }),
    request(createApp()).post('/api/recepciones/generar_excel').send({ remision_id: 1, token: bodyToken }),
    request(createApp()).post(`/api/recepciones/generar_excel?token=${bodyToken}`).send({ remision_id: 1 })
  ]);

  for (const response of responses) assert.equal(response.status, 401);
});

test('denies authenticated users without each route module permission before database access', async () => {
  const token = jwt.sign({ id: 7, rol: 'empleado', permisos: [] }, jwtSecret);
  const app = createApp();
  const cases = [
    ['get', '/api/usuarios/listar'],
    ['get', '/api/dashboard'],
    ['get', '/api/bodega'],
    ['get', '/api/catalogo/list'],
    ['get', '/api/traspasos/buscar'],
    ['get', '/api/recepciones'],
    ['post', '/api/captura/verificar'],
    ['get', '/api/reclamaciones'],
    ['get', '/api/evolucion-precios']
  ];

  for (const [method, url] of cases) {
    const response = await request(app)[method](url).set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 403, `${method.toUpperCase()} ${url}`);
    assert.deepEqual(response.body, { success: false, error: 'Acceso denegado.' });
  }
});

test('does not let operational permissions open administrative route modules', async () => {
  const token = jwt.sign(
    { id: 7, rol: 'empleado', permisos: ['captura', 'traspasos'] },
    jwtSecret
  );
  const app = createApp();

  for (const url of ['/api/captura/admin_list', '/api/traspasos/admin_list']) {
    const response = await request(app).get(url).set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 403, url);
    assert.deepEqual(response.body, { success: false, error: 'Acceso denegado.' });
  }
});

test('uses the common denial contract after module authorization passes', async () => {
  const cases = [
    ['post', '/api/bodega/guardar', 'bodega'],
    ['get', '/api/usuarios/listar', 'usuarios'],
    ['get', '/api/traspasos/admin_list', 'admin-traspasos'],
    ['get', '/api/captura/admin_list', 'auditoria'],
    ['post', '/api/reclamaciones/validar', 'reclamaciones']
  ];

  for (const [method, url, module] of cases) {
    const token = jwt.sign({ id: 7, rol: 'empleado', permisos: [module] }, jwtSecret);
    const response = await request(createApp())[method](url)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(response.status, 403, `${method.toUpperCase()} ${url}`);
    assert.deepEqual(response.body, { success: false, error: 'Acceso denegado.' });
  }
});

test('never interpolates a permission module in SQL', async () => {
  await assert.rejects(
    () => savePermissions({ usuario_id: 1, permisos: ["x'); DROP TABLE usuarios; --"] }),
    /módulo/
  );

  await assert.rejects(
    () => savePermissions({ usuario_id: '1', permisos: ['bodega'] }),
    /entero/
  );
});

test('saves allowed permission rows with parameters in one transaction', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(statement, parameters) { events.push(['execute', statement, parameters]); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  const database = { async getConnection() { return connection; } };

  await savePermissions(
    { usuario_id: 4, permisos: ['bodega', 'recepciones'] },
    database
  );

  assert.deepEqual(events, [
    'begin',
    ['execute', 'DELETE FROM usuario_permisos WHERE usuario_id = ?', [4]],
    ['execute', 'INSERT INTO usuario_permisos (usuario_id, modulo, permitido) VALUES (?, ?, 1)', [4, 'bodega']],
    ['execute', 'INSERT INTO usuario_permisos (usuario_id, modulo, permitido) VALUES (?, ?, 1)', [4, 'recepciones']],
    'commit',
    'release'
  ]);
});

test('rolls back permission changes when an insert fails', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(statement) {
      events.push(statement);
      if (statement.startsWith('INSERT')) throw new Error('database unavailable');
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };

  await assert.rejects(
    () => savePermissions(
      { usuario_id: 4, permisos: ['bodega'] },
      { async getConnection() { return connection; } }
    ),
    /database unavailable/
  );
  assert.equal(events.includes('commit'), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});

test('correlates permission rollback and release failures', async () => {
  const originalError = console.error;
  const logged = [];
  console.error = (entry) => logged.push(JSON.parse(entry));
  const connection = {
    async beginTransaction() {},
    async execute(statement) {
      if (statement.startsWith('INSERT')) throw new Error('insert failed');
    },
    async rollback() { throw new Error('rollback failed'); },
    release() { throw new Error('release failed'); }
  };

  try {
    await assert.rejects(
      () => savePermissions(
        { usuario_id: 4, permisos: ['bodega'], requestId: 'permissions-request' },
        { async getConnection() { return connection; } }
      ),
      /insert failed/
    );

    assert.equal(logged.length, 2);
    assert.ok(logged.every((entry) => entry.context.requestId === 'permissions-request'));
  } finally {
    console.error = originalError;
  }
});

test('uses one generic 401 response for every credential failure', async () => {
  const genericFailure = { success: false, error: 'Credenciales inválidas.' };
  const scenarios = [
    {
      database: { async execute() { return [[], []]; } },
      body: { usuario: 'desconocido', password: 'incorrecta' }
    },
    {
      database: { async execute() { return [[{ id: 2, activo: 0, password: 'unused' }], []]; } },
      body: { usuario: 'inactivo', password: 'incorrecta' }
    },
    {
      database: { async execute() { return [[{ id: 3, activo: 1, password: 'hash' }], []]; } },
      comparePassword: async () => false,
      body: { usuario: 'existente', password: 'incorrecta' }
    },
    {
      database: { async execute() { assert.fail('database access'); } },
      body: {}
    }
  ];

  for (const { database, comparePassword, body } of scenarios) {
    const app = express();
    app.use(express.json());
    app.use(createAuthRouter({
      database,
      comparePassword,
      loginLimiter: (_req, _res, next) => next(),
      jwtSecret
    }));

    const response = await request(app).post('/login').send(body);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, genericFailure);
  }
});

test('performs password hash work before rejecting an unknown account', async () => {
  const comparisons = [];
  const app = express();
  app.use(express.json());
  app.use(createAuthRouter({
    database: { async execute() { return [[], []]; } },
    comparePassword: async (...args) => { comparisons.push(args); return false; },
    loginLimiter: (_req, _res, next) => next(),
    jwtSecret
  }));

  const response = await request(app)
    .post('/login')
    .send({ usuario: 'desconocido', password: 'incorrecta' });

  assert.equal(response.status, 401);
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0][0], 'incorrecta');
  assert.match(comparisons[0][1], /^\$2[aby]\$10\$/);
});

test('limits repeated login attempts', async () => {
  const app = express();
  app.use(createLoginLimiter({ windowMs: 60_000, limit: 2 }));
  app.post('/login', (_req, res) => res.status(401).json({ success: false }));

  assert.equal((await request(app).post('/login')).status, 401);
  assert.equal((await request(app).post('/login')).status, 401);
  assert.equal((await request(app).post('/login')).status, 429);
});

test('does not count successful logins against the failure limit', async () => {
  const app = express();
  app.use(createLoginLimiter({ windowMs: 60_000, limit: 1 }));
  app.post('/login', (_req, res) => res.json({ success: true }));

  assert.equal((await request(app).post('/login')).status, 200);
  assert.equal((await request(app).post('/login')).status, 200);
});

test('emits CORS headers only for configured origins', async () => {
  const app = createApp({ corsOrigins: ['https://allowed.example'] });
  const allowed = await request(app).get('/api/not-found').set('Origin', 'https://allowed.example');
  const denied = await request(app).get('/api/not-found').set('Origin', 'https://denied.example');

  assert.equal(allowed.headers['access-control-allow-origin'], 'https://allowed.example');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});
