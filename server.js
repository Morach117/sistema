require('dotenv').config();

const { createApp } = require('./app');
const pool = require('./config/database');
const { loadEnv } = require('./config/env');
const { runMigrations } = require('./scripts/migrate');

function createNetworkServices({ apiPort, database }) {
  const { createClientDiscoveryService } = require('./services/client-discovery-service');
  const { createClientSyncService, createSqlSyncStore } = require('./services/client-sync-service');
  const clientDiscoveryService = createClientDiscoveryService({ apiPort });
  const clientSyncService = createClientSyncService({
    store: createSqlSyncStore({ database }),
    discoveryService: clientDiscoveryService,
  });
  return {
    clientDiscoveryService,
    clientSyncService,
    services: [clientDiscoveryService, clientSyncService],
  };
}

function superviseNetworkService(service, {
  scheduleRetry,
  cancelRetry,
  retryBaseMs,
  retryMaxMs,
}) {
  let stopped = false;
  let retryTimer;
  let nextDelay = retryBaseMs;

  function attempt() {
    if (stopped) return;
    Promise.resolve()
      .then(() => service.start())
      .then(() => { nextDelay = retryBaseMs; })
      .catch((error) => {
        if (stopped) return;
        require('./utils/logger').log(
          'error',
          'LAN client service startup failed; retry scheduled',
          { error, retryInMs: nextDelay }
        );
        const delay = nextDelay;
        nextDelay = Math.min(nextDelay * 2, retryMaxMs);
        retryTimer = scheduleRetry(attempt, delay);
        retryTimer?.unref?.();
      });
  }

  attempt();
  return async function stop() {
    stopped = true;
    if (retryTimer !== undefined) cancelRetry(retryTimer);
    await service.stop();
  };
}

async function startServer({
  createAppFn = createApp,
  poolInstance = pool,
  loadEnvFn = loadEnv,
  runMigrationsFn = runMigrations,
  createNetworkServicesFn = createNetworkServices,
  scheduleRetryFn,
  cancelRetryFn,
  networkRetryBaseMs = 1_000,
  networkRetryMaxMs = 60_000,
} = {}) {
  const config = loadEnvFn();
  const timers = require('node:timers');
  const scheduleRetry = scheduleRetryFn || timers.setTimeout;
  const cancelRetry = cancelRetryFn || timers.clearTimeout;

  try {
    await runMigrationsFn({ pool: poolInstance });
    const hasDatabaseInterface =
      typeof poolInstance?.execute === 'function' &&
      typeof poolInstance?.getConnection === 'function';
    const shouldCreateNetworkServices =
      createNetworkServicesFn !== createNetworkServices || hasDatabaseInterface;
    const createdNetworkServices = shouldCreateNetworkServices
      ? createNetworkServicesFn({ apiPort: config.port, database: poolInstance })
      : { services: [] };
    const networkServices = Array.isArray(createdNetworkServices)
      ? createdNetworkServices
      : createdNetworkServices.services;
    if (!Array.isArray(networkServices)) {
      throw new TypeError('La fábrica de servicios LAN debe devolver una lista de servicios.');
    }
    const httpServer = createAppFn({
      corsOrigins: config.corsOrigins,
      environment: config.env,
      clientSyncService: createdNetworkServices.clientSyncService,
      clientDiscoveryService: createdNetworkServices.clientDiscoveryService,
    }).listen(config.port);
    const stopNetworkServices = networkServices.map((service) => superviseNetworkService(service, {
      scheduleRetry,
      cancelRetry,
      retryBaseMs: networkRetryBaseMs,
      retryMaxMs: networkRetryMaxMs,
    }));
    httpServer.once?.('close', () => {
      Promise.allSettled(stopNetworkServices.map((stop) => stop())).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            require('./utils/logger').log(
              'error',
              'LAN client service shutdown failed',
              { error: result.reason }
            );
          }
        }
      });
    });
    return httpServer;
  } catch (error) {
    if (poolInstance && typeof poolInstance.end === 'function') {
      await poolInstance.end();
    }
    throw error;
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`No se pudo iniciar el servidor: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createNetworkServices, startServer, superviseNetworkService };
