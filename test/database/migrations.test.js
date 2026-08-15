const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');

const { createBackup } = require('../../backup_bd');
const { runMigrationCli, runMigrations } = require('../../scripts/migrate');
const {
    assertCatalogUnchanged,
    verifyBackupFile,
} = require('../../scripts/verify-backup');
const safeIndexMigration = require('../../database/migrations/002_safe_indexes');

function fakeMigrationPool({ indexDefinitions = [], missingColumns = [] } = {}) {
    const applied = new Map();
    const indexes = indexDefinitions.map((index) => ({ ...index, columns: [...index.columns] }));
    const absentColumns = new Set(missingColumns);
    const statements = [];

    const connection = {
        async query(sql, params = []) {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            statements.push({ sql: normalized, params });

            if (/^SELECT id, checksum FROM `_node_migrations`/i.test(normalized)) {
                return [[...applied].map(([id, checksum]) => ({ id, checksum }))];
            }

            if (/^INSERT INTO `_node_migrations`/i.test(normalized)) {
                applied.set(params[0], params[1]);
                return [{ affectedRows: 1 }];
            }

            if (/information_schema\.statistics/i.test(normalized)) {
                if (params.length > 1) {
                    const exact = indexes.some(
                        (index) => index.table === params[0] && index.name === params[1]
                    );
                    return [exact ? [{ present: 1 }] : []];
                }
                return [
                    indexes
                        .filter((index) => index.table === params[0])
                        .flatMap((index) =>
                            index.columns.map((column, position) => ({
                                index_name: index.name,
                                seq_in_index: position + 1,
                                column_name: column,
                            }))
                        ),
                ];
            }

            if (/information_schema\.columns/i.test(normalized)) {
                const [table, ...columns] = params;
                return [
                    columns
                        .filter((column) => !absentColumns.has(`${table}.${column}`))
                        .map((column) => ({ column_name: column })),
                ];
            }

            const addIndex = normalized.match(
                /^ALTER TABLE `([^`]+)` ADD INDEX `([^`]+)`/i
            );
            if (addIndex) {
                const columns = [...normalized.matchAll(/`([^`]+)`/g)]
                    .slice(2)
                    .map((match) => match[1]);
                indexes.push({ table: addIndex[1], name: addIndex[2], columns });
                return [{ affectedRows: 0 }];
            }

            return [[]];
        },
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
    };

    return {
        appliedMigrationIds: applied,
        statements,
        get catalogWriteStatements() {
            return statements.filter(({ sql }) =>
                /^(?:INSERT|UPDATE|DELETE|REPLACE|ALTER)\s+(?:INTO\s+)?`?cat_productos`?/i.test(sql)
            );
        },
        async getConnection() {
            return connection;
        },
    };
}

test('records an idempotent migration once without modifying cat_productos', async () => {
    const pool = fakeMigrationPool();

    await runMigrations({ pool, migrations: [safeIndexMigration] });
    await runMigrations({ pool, migrations: [safeIndexMigration] });

    assert.deepEqual([...pool.appliedMigrationIds.keys()], [safeIndexMigration.id]);
    assert.equal(pool.catalogWriteStatements.length, 0);
});

test('inspects information_schema before adding each missing allowlisted index', async () => {
    const pool = fakeMigrationPool({
        indexDefinitions: [
            {
                table: 'historial_items',
                name: 'idx_historial_items_clave_sicar',
                columns: ['clave_sicar'],
            },
        ],
    });

    await safeIndexMigration.up(await pool.getConnection());

    const relevantStatements = pool.statements.filter(({ sql }) =>
        /information_schema\.statistics|ALTER TABLE/i.test(sql)
    );
    const existingIndexAlter = relevantStatements.find(({ sql }) =>
        /ALTER TABLE `historial_items` ADD INDEX `idx_historial_items_clave_sicar`/i.test(sql)
    );

    const firstAlter = relevantStatements.findIndex(({ sql }) => /^ALTER TABLE/i.test(sql));
    assert.equal(firstAlter, 3);
    for (const statement of relevantStatements.slice(0, firstAlter)) {
        assert.match(statement.sql, /information_schema\.statistics/i);
    }
    assert.equal(existingIndexAlter, undefined);
});

test('does not duplicate an equivalent index with a different name', async () => {
    const pool = fakeMigrationPool({
        indexDefinitions: [
            {
                table: 'historial_items',
                name: 'legacy_historial_items_clave',
                columns: ['clave_sicar'],
            },
        ],
    });

    await safeIndexMigration.up(await pool.getConnection());

    assert.equal(
        pool.statements.some(({ sql }) => /^ALTER TABLE `historial_items`/i.test(sql)),
        false
    );
});

test('rejects an allowlisted index name that points to different columns', async () => {
    const pool = fakeMigrationPool({
        indexDefinitions: [
            {
                table: 'historial_items',
                name: 'idx_historial_items_clave_sicar',
                columns: ['remision_id'],
            },
        ],
    });

    await assert.rejects(
        safeIndexMigration.up(await pool.getConnection()),
        /idx_historial_items_clave_sicar.*incompatible/i
    );
    assert.equal(pool.statements.some(({ sql }) => /^ALTER TABLE/i.test(sql)), false);
});

test('treats MySQL index names as case-insensitive during preflight', async () => {
    const pool = fakeMigrationPool({
        indexDefinitions: [
            {
                table: 'historial_items',
                name: 'IDX_HISTORIAL_ITEMS_CLAVE_SICAR',
                columns: ['remision_id'],
            },
        ],
    });

    await assert.rejects(
        safeIndexMigration.up(await pool.getConnection()),
        /idx_historial_items_clave_sicar.*incompatible/i
    );
    assert.equal(pool.statements.some(({ sql }) => /^ALTER TABLE/i.test(sql)), false);
});

test('rejects an incompatible allowlisted schema before altering any table', async () => {
    const pool = fakeMigrationPool({ missingColumns: ['bodega_movimientos.fecha'] });

    await assert.rejects(
        safeIndexMigration.up(await pool.getConnection()),
        /bodega_movimientos.*fecha/i
    );
    assert.equal(pool.statements.some(({ sql }) => /^ALTER TABLE/i.test(sql)), false);
});

test('rejects a changed checksum for an already applied migration', async () => {
    const pool = fakeMigrationPool();
    const migration = {
        id: '900_checksum_guard',
        checksum: 'original-checksum',
        async up() {},
    };

    await runMigrations({ pool, migrations: [migration] });

    await assert.rejects(
        runMigrations({
            pool,
            migrations: [{ ...migration, checksum: 'changed-checksum' }],
        }),
        /checksum/i
    );
});

test('validates migration exports before sorting or acquiring a connection', async () => {
    let connectionAttempts = 0;

    await assert.rejects(
        runMigrations({
            pool: {
                async getConnection() {
                    connectionAttempts += 1;
                    return {};
                },
            },
            migrations: [
                null,
                { id: '900_valid', checksum: 'valid-checksum', async up() {} },
            ],
        }),
        /debe exportar id, checksum y up/i
    );
    assert.equal(connectionAttempts, 0);
});

test('validates directory-loaded migrations before sorting them', async (t) => {
    const migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sistema-migrations-invalid-'));
    t.after(() => fs.rmSync(migrationsDir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(migrationsDir, '001_invalid.js'), 'module.exports = null;\n');
    fs.writeFileSync(
        path.join(migrationsDir, '002_valid.js'),
        "module.exports = { id: '002_valid', checksum: 'valid', async up() {} };\n"
    );
    let connectionAttempts = 0;

    await assert.rejects(
        runMigrations({
            pool: {
                async getConnection() {
                    connectionAttempts += 1;
                    return {};
                },
            },
            migrationsDir,
        }),
        /debe exportar id, checksum y up/i
    );
    assert.equal(connectionAttempts, 0);
});

test('does not acquire a database connection when the pre-migration backup fails', async () => {
    let connectionAttempts = 0;
    const pool = {
        async getConnection() {
            connectionAttempts += 1;
            throw new Error('database access must not happen');
        },
    };

    await assert.rejects(
        runMigrationCli({
            pool,
            async createBackupFn() {
                throw new Error('backup failed');
            },
        }),
        /backup failed/i
    );
    assert.equal(connectionAttempts, 0);
});

test('rejects a changed cat_productos snapshot', () => {
    const before = { rowCount: 27, checksum: 'catalog-v1' };

    assert.throws(
        () =>
            assertCatalogUnchanged({
                before,
                after: { rowCount: 26, checksum: 'catalog-v2' },
            }),
        /cat_productos/i
    );
    assert.doesNotThrow(() => assertCatalogUnchanged({ before, after: { ...before } }));
});

test('rejects incomplete cat_productos snapshots instead of failing open', () => {
    assert.throws(
        () => assertCatalogUnchanged({ before: {}, after: {} }),
        /snapshot|rowCount|checksum/i
    );
});

test('rejects an empty backup file without accessing a database', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sistema-backup-test-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const emptyBackup = path.join(tempDir, 'empty.sql');
    fs.writeFileSync(emptyBackup, '');

    await assert.rejects(verifyBackupFile(emptyBackup), /vacío|empty/i);
});

test('importing the backup module neither creates credentials nor starts a dump', () => {
    const backupPath = path.join(__dirname, '..', '..', 'backup_bd.js');
    const source = fs.readFileSync(backupPath, 'utf8');
    const writes = [];
    const childProcesses = [];
    const backupModule = { exports: {} };
    const fakeFs = {
        existsSync() {
            return false;
        },
        writeFileSync(...args) {
            writes.push(args);
        },
        mkdirSync(...args) {
            writes.push(args);
        },
    };
    const sandboxRequire = (request) => {
        if (request === 'fs' || request === 'node:fs') return fakeFs;
        if (request === 'child_process' || request === 'node:child_process') {
            return {
                exec(...args) {
                    childProcesses.push(args);
                },
                spawn(...args) {
                    childProcesses.push(args);
                },
            };
        }
        if (request === 'dotenv') return { config() {} };
        return require(request);
    };
    sandboxRequire.main = {};

    vm.runInNewContext(source, {
        __dirname: path.dirname(backupPath),
        __filename: backupPath,
        console: { log() {}, error() {} },
        module: backupModule,
        exports: backupModule.exports,
        process: { env: {}, exitCode: 0 },
        require: sandboxRequire,
    });

    assert.equal(typeof backupModule.exports.createBackup, 'function');
    assert.equal(writes.length, 0);
    assert.equal(childProcesses.length, 0);
});

function fakeDumpProcess({ content = '', exitCode = 0, stderr = '' } = {}) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();

    process.nextTick(() => {
        child.stdout.end(content);
        child.stderr.end(stderr);
        child.emit('close', exitCode, null);
    });

    return child;
}

test('publishes a non-empty backup atomically using spawn arguments', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sistema-backup-success-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const calls = [];

    const result = await createBackup({
        backupDir: tempDir,
        config: {
            host: 'db host & echo unsafe',
            user: 'backup-user',
            password: 'not-in-arguments',
            database: 'papeleria',
        },
        dumpExecutable: 'fake-mysqldump',
        now: new Date('2026-08-14T12:34:56.000Z'),
        spawnImpl(command, args, options) {
            calls.push({ command, args, options });
            return fakeDumpProcess({ content: '-- safe sql dump\nCREATE TABLE example;\n' });
        },
    });

    assert.equal(fs.readFileSync(result.filePath, 'utf8'), '-- safe sql dump\nCREATE TABLE example;\n');
    assert.deepEqual(fs.readdirSync(tempDir), [path.basename(result.filePath)]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'fake-mysqldump');
    assert.ok(Array.isArray(calls[0].args));
    assert.ok(calls[0].args.includes('--host=db host & echo unsafe'));
    assert.equal(calls[0].args.some((argument) => argument.includes('not-in-arguments')), false);
    assert.equal(calls[0].options.shell, false);
});

test('removes the temporary dump when backup verification fails', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sistema-backup-empty-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

    await assert.rejects(
        createBackup({
            backupDir: tempDir,
            config: { host: 'localhost', user: 'root', password: '', database: 'papeleria' },
            dumpExecutable: 'fake-mysqldump',
            spawnImpl() {
                return fakeDumpProcess();
            },
        }),
        /vacío|incompleto/i
    );

    assert.deepEqual(fs.readdirSync(tempDir), []);
});

test('terminates the dump process before cleaning up after an output failure', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sistema-backup-stream-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const originalCreateWriteStream = fs.createWriteStream;
    let killCalled = false;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
        killCalled = true;
        process.nextTick(() => {
            child.stdout.destroy();
            child.stderr.end();
            child.emit('close', null, 'SIGTERM');
        });
        return true;
    };
    fs.createWriteStream = () =>
        new Writable({
            write(_chunk, _encoding, callback) {
                callback(new Error('disk full'));
            },
        });
    t.after(() => {
        fs.createWriteStream = originalCreateWriteStream;
    });

    process.nextTick(() => child.stdout.write('partial dump'));
    await assert.rejects(
        createBackup({
            backupDir: tempDir,
            config: { host: 'localhost', user: 'root', password: '', database: 'papeleria' },
            dumpExecutable: 'fake-mysqldump',
            spawnImpl() {
                return child;
            },
        }),
        /disk full/i
    );

    assert.equal(killCalled, true);
    assert.deepEqual(fs.readdirSync(tempDir), []);
});
