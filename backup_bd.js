const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { finished } = require('node:stream/promises');

function safeFileSegment(value) {
    return String(value).replace(/[^a-z0-9_-]+/gi, '_');
}

function resolveDumpExecutable(explicitExecutable) {
    if (explicitExecutable) {
        return explicitExecutable;
    }
    const xamppDump = 'C:\\xampp\\mysql\\bin\\mysqldump.exe';
    return fs.existsSync(xamppDump) ? xamppDump : 'mysqldump';
}

function decodeStderrWithinLimit(chunks, maxBytes = 16_384) {
    const decoded = Buffer.concat(chunks).toString('utf8');
    const accepted = [];
    let acceptedBytes = 0;

    for (const character of decoded) {
        const characterBytes = Buffer.byteLength(character, 'utf8');
        if (acceptedBytes + characterBytes > maxBytes) {
            break;
        }
        accepted.push(character);
        acceptedBytes += characterBytes;
    }

    return accepted.join('');
}

function waitForDump(child, stderrChunks) {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            const detail = decodeStderrWithinLimit(stderrChunks).trim();
            reject(
                new Error(
                    `mysqldump terminó con código ${code ?? 'desconocido'}` +
                        `${signal ? ` (señal ${signal})` : ''}` +
                        `${detail ? `: ${detail}` : ''}`
                )
            );
        });
    });
}

async function createBackup({
    backupDir = path.join(__dirname, 'backups'),
    config,
    dumpExecutable,
    now = new Date(),
    spawnImpl = spawn,
} = {}) {
    const selectedConfig = {
        host: config?.host ?? process.env.DB_HOST ?? '127.0.0.1',
        user: config?.user ?? process.env.DB_USER ?? 'root',
        password: config?.password ?? process.env.DB_PASSWORD ?? '',
        database: config?.database ?? process.env.DB_NAME ?? 'importador_papeleria',
    };

    if (!selectedConfig.host || !selectedConfig.user || !selectedConfig.database) {
        throw new TypeError('La configuración del respaldo requiere host, user y database.');
    }

    const absoluteBackupDir = path.resolve(backupDir);
    await fsPromises.mkdir(absoluteBackupDir, { recursive: true });
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${safeFileSegment(selectedConfig.database)}_${timestamp}.sql`;
    const filePath = path.join(absoluteBackupDir, fileName);
    const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    const args = [
        `--host=${selectedConfig.host}`,
        `--user=${selectedConfig.user}`,
        '--default-character-set=utf8mb4',
        '--single-transaction',
        '--quick',
        '--skip-lock-tables',
        '--databases',
        selectedConfig.database,
    ];
    const childEnv = { ...process.env };
    if (selectedConfig.password) {
        childEnv.MYSQL_PWD = selectedConfig.password;
    } else {
        delete childEnv.MYSQL_PWD;
    }

    let child;
    let dumpCompletion;
    let output;
    try {
        output = fs.createWriteStream(tempPath, { flags: 'wx' });
        child = spawnImpl(resolveDumpExecutable(dumpExecutable), args, {
            env: childEnv,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        if (!child?.stdout || !child?.stderr) {
            throw new Error('mysqldump no proporcionó streams de salida verificables.');
        }

        const stderrChunks = [];
        let stderrBytes = 0;
        child.stderr.on('data', (chunk) => {
            const remaining = 16_384 - stderrBytes;
            if (remaining <= 0) {
                return;
            }
            const buffer = Buffer.from(chunk);
            const captured = buffer.subarray(0, remaining);
            stderrChunks.push(captured);
            stderrBytes += captured.length;
        });
        child.stdout.pipe(output);

        dumpCompletion = waitForDump(child, stderrChunks);
        await Promise.all([dumpCompletion, finished(output)]);
        const { verifyBackupFile } = require('./scripts/verify-backup');
        const verified = await verifyBackupFile(tempPath);
        await fsPromises.rename(tempPath, filePath);

        return { filePath, size: verified.size };
    } catch (error) {
        output?.destroy();
        if (
            child &&
            child.exitCode == null &&
            child.signalCode == null &&
            !child.killed &&
            typeof child.kill === 'function'
        ) {
            try {
                child.kill();
            } catch (_killError) {
                // The original stream or process error remains the actionable failure.
            }
        }
        await dumpCompletion?.catch(() => {});
        await (output ? finished(output).catch(() => {}) : Promise.resolve());
        await fsPromises.rm(tempPath, { force: true }).catch(() => {});
        throw error;
    }
}

async function main() {
    require('dotenv').config();
    const result = await createBackup();
    console.log(`Respaldo guardado y verificado: ${result.filePath} (${result.size} bytes)`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`No se pudo crear el respaldo: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    createBackup,
};
