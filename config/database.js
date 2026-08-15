const mysql = require('mysql2/promise');
const { log } = require('../utils/logger');
const { loadDatabaseConfig, readActiveDatabasePort } = require('./database-config');
require('dotenv').config();

// Leer el puerto activo que ya se determinó y guardó en caché (compartido con PHP/Migraciones)
const databaseConfig = loadDatabaseConfig(process.env, {
    defaultPort: readActiveDatabasePort(),
});

const CONNECT_TIMEOUT_MS = 10_000;
const ACQUIRE_TIMEOUT_MS = 10_000;
const QUEUE_LIMIT = 20;

function createBoundedPool(rawPool, { acquireTimeoutMs = ACQUIRE_TIMEOUT_MS } = {}) {
    async function getConnection() {
        let timeout;
        let timedOut = false;
        const connectionPromise = Promise.resolve().then(() => rawPool.getConnection());
        const timeoutPromise = new Promise((resolve, reject) => {
            timeout = setTimeout(() => {
                timedOut = true;
                reject(new Error('Database connection acquisition timed out'));
            }, acquireTimeoutMs);
        });

        try {
            return await Promise.race([connectionPromise, timeoutPromise]);
        } finally {
            clearTimeout(timeout);
            if (timedOut) {
                connectionPromise
                    .then((connection) => {
                        try {
                            connection.release();
                        } catch (error) {
                            log('error', 'Late database connection release failed', { error });
                        }
                    })
                    .catch(() => {});
            }
        }
    }

    async function withConnection(method, statement, parameters) {
        const connection = await getConnection();
        try {
            return parameters === undefined
                ? await connection[method](statement)
                : await connection[method](statement, parameters);
        } finally {
            connection.release();
        }
    }

    return {
        config: rawPool.pool?.config || rawPool.config,
        getConnection,
        execute(statement, parameters) {
            return withConnection('execute', statement, parameters);
        },
        query(statement, parameters) {
            return withConnection('query', statement, parameters);
        },
        end() {
            return rawPool.end();
        },
        escape(value) {
            return rawPool.escape(value);
        },
        escapeId(value) {
            return rawPool.escapeId(value);
        },
        format(statement, values) {
            return rawPool.format(statement, values);
        },
        createBoundedPool
    };
}

const rawPool = mysql.createPool({
    ...databaseConfig,
    multipleStatements: false,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: CONNECT_TIMEOUT_MS,
    queueLimit: QUEUE_LIMIT
});

const pool = createBoundedPool(rawPool);

module.exports = pool;
