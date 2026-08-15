const { createHash } = require('node:crypto');

const id = '004_reception_xml_vat_persistence';
const statements = Object.freeze({
    iva_tasa: 'ADD COLUMN `iva_tasa` DECIMAL(6,4) NULL DEFAULT NULL AFTER `aplica_iva`',
    costo_incluye_iva: 'ADD COLUMN `costo_incluye_iva` TINYINT(1) NOT NULL DEFAULT 0 AFTER `iva_tasa`',
});

async function missingColumns(connection, table, columns) {
    const [rows] = await connection.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = ?
            AND column_name IN (${columns.map(() => '?').join(', ')})`,
        [table, ...columns]
    );
    const present = new Set((rows || []).map((row) => String(row.column_name).toLowerCase()));
    return columns.filter((column) => !present.has(column.toLowerCase()));
}

module.exports = {
    id,
    checksum: createHash('sha256').update(JSON.stringify(statements)).digest('hex'),
    async up(connection) {
        const missing = await missingColumns(connection, 'historial_items', [
            'iva_tasa',
            'costo_incluye_iva',
        ]);

        if (missing.length === 0) {
            return;
        }

        const clauses = missing.map((column) => statements[column]);
        await connection.query(`ALTER TABLE \`historial_items\` ${clauses.join(', ')}`);
    },
};
