const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../../config/database');

test('uses finite database connection and queue boundaries', () => {
  assert.ok(database.config.connectionConfig.connectTimeout > 0);
  assert.ok(database.config.queueLimit > 0);
});

test('bounds connection acquisition waits', async () => {
  const rawPool = {
    getConnection() {
      return new Promise(() => {});
    }
  };
  const boundedPool = database.createBoundedPool(rawPool, { acquireTimeoutMs: 10 });

  await assert.rejects(
    () => boundedPool.getConnection(),
    /acquisition timed out/i
  );
});
