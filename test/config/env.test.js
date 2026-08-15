const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../../config/env');

test('rejects a missing JWT_SECRET outside test mode', () => {
  assert.throws(() => loadEnv({ NODE_ENV: 'production' }), /JWT_SECRET/);
});

test('accepts an explicit secret and bounded port', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    JWT_SECRET: 'a'.repeat(32),
    PORT: '3001',
    CORS_ORIGINS: 'https://sucursal.example, https://admin.example'
  });
  assert.equal(env.port, 3001);
  assert.deepEqual(env.corsOrigins, ['https://sucursal.example', 'https://admin.example']);
});

test('rejects invalid HTTP and database ports before startup', () => {
  assert.throws(() => loadEnv({ NODE_ENV: 'test', PORT: '70000' }), /PORT/);
  assert.throws(() => loadEnv({ NODE_ENV: 'test', PORT: '1e3' }), /PORT/);
  assert.throws(() => loadEnv({ NODE_ENV: 'test', DB_PORT: 'not-a-port' }), /DB_PORT/);
});

test('returns one validated database identity for the server, pool and backup', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    PORT: '3000',
    DB_HOST: 'branch-db',
    DB_PORT: '3312',
    DB_USER: 'operator',
    DB_PASSWORD: 'secret',
    DB_NAME: 'branch_catalog'
  });

  assert.deepEqual(env.database, {
    host: 'branch-db',
    port: 3312,
    user: 'operator',
    password: 'secret',
    database: 'branch_catalog'
  });
});
