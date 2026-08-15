const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DATABASE_PORT = 3306;

function parsePort(value, field = 'DB_PORT') {
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw new TypeError(`${field} debe ser un puerto entero entre 1 y 65535.`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError(`${field} debe ser un puerto entero entre 1 y 65535.`);
  }
  return port;
}

function readActiveDatabasePort({ activePortPath = path.join(__dirname, '.active_port') } = {}) {
  try {
    if (!fs.existsSync(activePortPath)) return DEFAULT_DATABASE_PORT;
    return parsePort(fs.readFileSync(activePortPath, 'utf8').trim(), 'config/.active_port');
  } catch (error) {
    if (error instanceof TypeError) throw error;
    return DEFAULT_DATABASE_PORT;
  }
}

function loadDatabaseConfig(source = process.env, { defaultPort = DEFAULT_DATABASE_PORT } = {}) {
  const config = {
    host: String(source.DB_HOST || '127.0.0.1').trim(),
    port: parsePort(source.DB_PORT ?? defaultPort),
    user: String(source.DB_USER || 'root').trim(),
    password: String(source.DB_PASSWORD || ''),
    database: String(source.DB_NAME || 'importador_papeleria').trim(),
  };
  if (!config.host || !config.user || !config.database) {
    throw new TypeError('DB_HOST, DB_USER y DB_NAME deben identificar una base de datos.');
  }
  if ([config.host, config.user, config.database].some((value) => /[\0\r\n]/.test(value))) {
    throw new TypeError('La configuracion de base de datos contiene caracteres no permitidos.');
  }
  return Object.freeze(config);
}

module.exports = { DEFAULT_DATABASE_PORT, loadDatabaseConfig, parsePort, readActiveDatabasePort };
