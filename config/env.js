const { loadDatabaseConfig, parsePort } = require('./database-config');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function createLocalSecretStore(secretPath = path.join(__dirname, '..', 'data', '.jwt-secret')) {
  return {
    read() {
      try {
        return fs.readFileSync(secretPath, 'utf8').trim();
      } catch (error) {
        if (error.code === 'ENOENT') return '';
        throw error;
      }
    },
    write(secret) {
      fs.mkdirSync(path.dirname(secretPath), { recursive: true });
      fs.writeFileSync(secretPath, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(secretPath, 0o600);
    },
    generate() {
      return crypto.randomBytes(48).toString('base64url');
    },
  };
}

function resolveJwtSecret(source, localSecret) {
  const configuredSecret = source.JWT_SECRET;
  if (configuredSecret && configuredSecret.length >= 32) return configuredSecret;

  if (source.NODE_ENV !== 'test' && configuredSecret) {
    const persistedSecret = String(localSecret.read() || '');
    if (persistedSecret.length >= 32) return persistedSecret;
    const generatedSecret = localSecret.generate();
    if (generatedSecret.length < 32) throw new Error('No se pudo generar un JWT_SECRET seguro.');
    localSecret.write(generatedSecret);
    return generatedSecret;
  }

  if (source.NODE_ENV !== 'test') {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }

  return configuredSecret;
}

function loadEnv(source = process.env, { localSecret = createLocalSecretStore() } = {}) {
  const jwtSecret = resolveJwtSecret(source, localSecret);
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

module.exports = { createLocalSecretStore, loadEnv, resolveJwtSecret };
