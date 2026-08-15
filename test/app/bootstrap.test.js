const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../app');
const { errorHandler } = require('../../middleware/errors');
const { request, responseRecorder } = require('../helpers/app');
const packageJson = require('../../package.json');

test('setup is build-only and never migrates or mutates PM2', () => {
  assert.doesNotMatch(packageJson.scripts.setup, /migrate|pm2/i);
});

test('does not expose unmarked client-error details', () => {
  const response = responseRecorder();
  const originalError = console.error;
  console.error = () => {};

  try {
    errorHandler(
      { status: 400, message: 'SELECT password FROM usuarios' },
      { requestId: 'request-123' },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Ocurri\u00f3 un error interno.',
    requestId: 'request-123'
  });
});

test('exposes an explicitly safe client-error message', () => {
  const response = responseRecorder();

  errorHandler(
    { status: 400, isPublic: true, message: 'Invalid input' },
    { requestId: 'request-123' },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: 'Invalid input',
    requestId: 'request-123'
  });
});

test('adds a request ID and does not disclose Express', async () => {
  const response = await request(createApp()).get('/api/not-found');

  assert.equal(response.status, 404);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('adds a request ID to CORS preflight responses', async () => {
  const response = await request(createApp({ corsOrigins: ['https://allowed.example'] }))
    .options('/api/catalogo/list')
    .set('Origin', 'https://allowed.example')
    .set('Access-Control-Request-Method', 'GET');

  assert.equal(response.status, 204);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
});

test('rejects JSON payloads larger than 1 MB without exposing parser details', async () => {
  const originalError = console.error;
  console.error = () => {};
  let response;

  try {
    response = await request(createApp())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ payload: 'a'.repeat(1024 * 1024) });
  } finally {
    console.error = originalError;
  }

  assert.equal(response.status, 413);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Ocurri\u00f3 un error interno.',
    requestId: response.headers['x-request-id']
  });
});

test('never serves repository backup files when the frontend build is missing', async () => {
  const response = await request(createApp({
    environment: 'development',
    frontendDistPath: 'C:\\path-that-does-not-exist\\frontend-dist'
  })).get('/backup_bd.js');

  assert.equal(response.status, 404);
  assert.doesNotMatch(response.text, /createBackup|mysqldump/i);
});

test('fails closed in production when the frontend build is missing', () => {
  assert.throws(
    () => createApp({ environment: 'production', frontendDistPath: 'C:\\missing-dist' }),
    /frontend|dist|build/i
  );
});

test('serves only an explicit safe development directory when dist is missing', async (t) => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const safeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sistema-public-'));
  t.after(() => fs.rm(safeDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(safeDir, 'index.html'), '<h1>safe dev shell</h1>');

  const app = createApp({
    environment: 'development',
    frontendDistPath: path.join(safeDir, 'missing'),
    developmentPublicPath: safeDir
  });
  assert.match((await request(app).get('/')).text, /safe dev shell/);
  assert.equal((await request(app).get('/backup_bd.js')).status, 404);
});

test('reports readiness only after the database check succeeds', async () => {
  let checks = 0;
  const response = await request(createApp({
    readinessCheck: async () => { checks += 1; }
  })).get('/health');

  assert.equal(response.status, 200);
  assert.equal(checks, 1);
  assert.deepEqual(response.body, { status: 'ready' });
});

test('reports generic unavailability with request correlation when readiness fails', async () => {
  const originalError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await request(createApp({
      readinessCheck: async () => { throw new Error('private database endpoint'); }
    })).get('/health');
  } finally {
    console.error = originalError;
  }

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    status: 'unavailable',
    requestId: response.headers['x-request-id']
  });
  assert.doesNotMatch(response.text, /private database endpoint/i);
});
