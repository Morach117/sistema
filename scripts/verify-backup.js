const fs = require('node:fs/promises');
const path = require('node:path');

function assertCatalogUnchanged({ before, after } = {}) {
    if (!before || !after) {
        throw new TypeError('Se requieren snapshots before y after de cat_productos.');
    }
    for (const snapshot of [before, after]) {
        if (
            !Number.isSafeInteger(snapshot.rowCount) ||
            snapshot.rowCount < 0 ||
            typeof snapshot.checksum !== 'string' ||
            !snapshot.checksum
        ) {
            throw new TypeError('Cada snapshot requiere rowCount y checksum válidos.');
        }
    }

    if (before.rowCount !== after.rowCount || before.checksum !== after.checksum) {
        throw new Error('La verificación de cat_productos detectó cambios.');
    }
}

async function verifyBackupFile(filePath, { minimumBytes = 1 } = {}) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new TypeError('Se requiere la ruta del respaldo.');
    }
    if (!Number.isSafeInteger(minimumBytes) || minimumBytes < 1) {
        throw new TypeError('minimumBytes debe ser un entero positivo.');
    }

    const absolutePath = path.resolve(filePath);
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
        throw new Error(`El respaldo no es un archivo regular: ${absolutePath}`);
    }
    if (stats.size < minimumBytes) {
        throw new Error(`El respaldo está vacío o incompleto: ${absolutePath}`);
    }

    return { path: absolutePath, size: stats.size };
}

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        throw new Error('Uso: node scripts/verify-backup.js <archivo.sql>');
    }
    const result = await verifyBackupFile(filePath);
    console.log(`Respaldo verificado: ${result.path} (${result.size} bytes)`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`No se pudo verificar el respaldo: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    assertCatalogUnchanged,
    verifyBackupFile,
};
