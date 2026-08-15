const fs = require('node:fs');
const path = require('node:path');

const historyMigration = require('../database/migrations/001_migration_history');
const { version: appVersion } = require('../package.json');

function loadMigrations(migrationsDir) {
    return fs
        .readdirSync(migrationsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^\d+_[a-z0-9_-]+\.js$/i.test(entry.name))
        .map((entry) => require(path.join(migrationsDir, entry.name)));
}

function validateMigrations(migrations) {
    const ids = new Set();

    for (const migration of migrations) {
        if (
            !migration ||
            typeof migration.id !== 'string' ||
            !/^[a-z0-9_-]+$/i.test(migration.id) ||
            typeof migration.checksum !== 'string' ||
            !migration.checksum ||
            typeof migration.up !== 'function'
        ) {
            throw new TypeError('Cada migración debe exportar id, checksum y up(connection) válidos.');
        }
        if (ids.has(migration.id)) {
            throw new Error(`La migración ${migration.id} está duplicada.`);
        }
        ids.add(migration.id);
    }
}

async function runMigrations({
    pool,
    migrationsDir = path.join(__dirname, '..', 'database', 'migrations'),
    migrations,
} = {}) {
    if (!pool || (typeof pool.getConnection !== 'function' && typeof pool.query !== 'function')) {
        throw new TypeError('runMigrations requiere un pool de MySQL.');
    }

    const selectedMigrations = migrations
        ? [...migrations]
        : loadMigrations(path.resolve(migrationsDir));
    validateMigrations(selectedMigrations);
    selectedMigrations.sort((left, right) => left.id.localeCompare(right.id));

    const connection =
        typeof pool.getConnection === 'function' ? await pool.getConnection() : pool;

    try {
        await historyMigration.up(connection);
        const [rows] = await connection.query(
            'SELECT id, checksum FROM `_node_migrations` ORDER BY id'
        );
        const applied = new Map(rows.map((row) => [row.id, row.checksum]));
        const results = [];

        for (const migration of selectedMigrations) {
            if (applied.has(migration.id)) {
                if (applied.get(migration.id) !== migration.checksum) {
                    throw new Error(
                        `El checksum de la migración ${migration.id} no coincide con el registrado.`
                    );
                }
                results.push({ id: migration.id, status: 'skipped' });
                continue;
            }

            let transactionStarted = false;
            try {
                if (typeof connection.beginTransaction === 'function') {
                    await connection.beginTransaction();
                    transactionStarted = true;
                }
                await migration.up(connection);
                await connection.query(
                    `INSERT INTO \`_node_migrations\`
                        (id, checksum, applied_at, app_version)
                     VALUES (?, ?, CURRENT_TIMESTAMP(3), ?)`,
                    [migration.id, migration.checksum, appVersion]
                );
                if (transactionStarted && typeof connection.commit === 'function') {
                    await connection.commit();
                }
                applied.set(migration.id, migration.checksum);
                results.push({ id: migration.id, status: 'applied' });
            } catch (error) {
                if (transactionStarted && typeof connection.rollback === 'function') {
                    await connection.rollback();
                }
                throw error;
            }
        }

        return results;
    } finally {
        if (connection !== pool && typeof connection.release === 'function') {
            connection.release();
        }
    }
}

async function runMigrationCli({
    pool,
    createBackupFn = require('../backup_bd').createBackup,
    backupOptions,
    migrationsDir,
} = {}) {
    await createBackupFn(backupOptions);
    return runMigrations({ pool, migrationsDir });
}

async function main() {
    const pool = require('../config/database');
    try {
        const results = await runMigrationCli({ pool });
        for (const result of results) {
            console.log(`${result.id}: ${result.status}`);
        }
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`No se pudieron aplicar las migraciones: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    loadMigrations,
    runMigrationCli,
    runMigrations,
};
