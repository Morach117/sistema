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
