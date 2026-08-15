const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { startServer } = require('../../server');

function serverDependencies(overrides = {}) {
  const httpServer = new EventEmitter();
  return {
    httpServer,
    dependencies: {
      createAppFn: () => ({ listen: () => httpServer }),
      poolInstance: { async end() {} },
      loadEnvFn: () => ({ corsOrigins: [], env: 'test', port: 4312 }),
      runMigrationsFn: async () => {},
      ...overrides,
    },
  };
}

test('returns the listening HTTP server without waiting for LAN services to become available', async () => {
  let releaseNetworkStart;
  const pendingStart = new Promise((resolve) => { releaseNetworkStart = resolve; });
  const networkService = {
    start: () => pendingStart,
    async stop() {},
  };
  const { httpServer, dependencies } = serverDependencies({
    createNetworkServicesFn: () => [networkService],
  });

  const result = await startServer(dependencies);

  assert.equal(result, httpServer);
  releaseNetworkStart();
});

test('retries failed LAN startup with progressive delays and stops it when HTTP closes', async () => {
  const scheduled = [];
  let attempts = 0;
  let stops = 0;
  const networkService = {
    async start() {
      attempts += 1;
      if (attempts < 3) throw new Error('network unavailable');
    },
    async stop() { stops += 1; },
  };
  const { httpServer, dependencies } = serverDependencies({
    createNetworkServicesFn: () => [networkService],
    scheduleRetryFn(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    cancelRetryFn() {},
    networkRetryBaseMs: 250,
    networkRetryMaxMs: 1_000,
  });
  const originalError = console.error;
  console.error = () => {};

  try {
    await startServer(dependencies);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(attempts, 1);
    assert.equal(scheduled[0].delay, 250);

    scheduled.shift().callback();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(attempts, 2);
    assert.equal(scheduled[0].delay, 500);

    scheduled.shift().callback();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(attempts, 3);
    assert.equal(scheduled.length, 0);

    httpServer.emit('close');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stops, 1);
  } finally {
    console.error = originalError;
  }
});
