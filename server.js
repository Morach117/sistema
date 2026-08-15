require('dotenv').config();

const { createApp } = require('./app');
const pool = require('./config/database');
const { loadEnv } = require('./config/env');
const { runMigrations } = require('./scripts/migrate');

async function startServer({
  createAppFn = createApp,
  poolInstance = pool,
  loadEnvFn = loadEnv,
  runMigrationsFn = runMigrations,
} = {}) {
  const config = loadEnvFn();

  try {
    await runMigrationsFn({ pool: poolInstance });
    return createAppFn({
      corsOrigins: config.corsOrigins,
      environment: config.env,
    }).listen(config.port);
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

module.exports = { startServer };
