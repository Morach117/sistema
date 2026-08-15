const { loadDatabaseConfig, parsePort } = require('./database-config');

function loadEnv(source = process.env) {
  const jwtSecret = source.JWT_SECRET;
  if (source.NODE_ENV !== 'test' && (!jwtSecret || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return {
    env: source.NODE_ENV || 'development',
    port: parsePort(source.PORT || 3000, 'PORT'),
    jwtSecret,
    database: loadDatabaseConfig(source),
    corsOrigins: String(source.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  };
}

module.exports = { loadEnv };
