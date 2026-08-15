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

test('logs a late connection release failure', async () => {
  let resolveConnection;
  const rawPool = {
    getConnection() {
      return new Promise((resolve) => { resolveConnection = resolve; });
    }
  };
  const boundedPool = database.createBoundedPool(rawPool, { acquireTimeoutMs: 10 });
  const originalError = console.error;
  const logged = [];
  console.error = (entry) => logged.push(JSON.parse(entry));

  try {
    await assert.rejects(() => boundedPool.getConnection(), /acquisition timed out/i);
    resolveConnection({ release() { throw new Error('late release failed'); } });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(logged.length, 1);
    assert.equal(logged[0].message, 'Late database connection release failed');
    assert.equal(logged[0].context.error.message, 'late release failed');
  } finally {
    console.error = originalError;
  }
});
