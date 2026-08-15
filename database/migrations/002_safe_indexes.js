const { createHash } = require('node:crypto');

const id = '002_safe_indexes';
const indexes = Object.freeze([
    Object.freeze({
        table: 'historial_items',
        name: 'idx_historial_items_clave_sicar',
        columns: Object.freeze(['clave_sicar']),
    }),
    Object.freeze({
        table: 'bodega_movimientos',
        name: 'idx_bodega_movimientos_clave_fecha',
        columns: Object.freeze(['clave_sicar', 'fecha']),
    }),
    Object.freeze({
        table: 'logs_auditoria',
        name: 'idx_logs_auditoria_usuario_fecha',
        columns: Object.freeze(['usuario_id', 'fecha']),
    }),
]);

function collectIndexColumns(rows) {
    const definitions = new Map();
    for (const row of rows) {
        const normalizedName = String(row.index_name).toLowerCase();
        const current = definitions.get(normalizedName) || [];
        current[Number(row.seq_in_index) - 1] = row.column_name;
        definitions.set(normalizedName, current);
    }
    return definitions;
}

function hasIndexPrefix(actualColumns, requiredColumns) {
    return requiredColumns.every(
        (column, position) =>
            String(actualColumns[position]).toLowerCase() === column.toLowerCase()
    );
}

async function up(connection) {
    const pending = [];

    for (const index of indexes) {
        const [indexRows] = await connection.query(
            `SELECT index_name, seq_in_index, column_name
                   FROM information_schema.statistics
                  WHERE table_schema = DATABASE()
                    AND table_name = ?
                  ORDER BY index_name, seq_in_index`,
            [index.table]
        );
        const placeholders = index.columns.map(() => '?').join(', ');
        const [columnRows] = await connection.query(
            `SELECT column_name
               FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = ?
                AND column_name IN (${placeholders})`,
            [index.table, ...index.columns]
        );
        const availableColumns = new Set(
            columnRows.map((row) => String(row.column_name).toLowerCase())
        );
        const missingColumns = index.columns.filter(
            (column) => !availableColumns.has(column.toLowerCase())
        );
        if (missingColumns.length > 0) {
            throw new Error(
                `Esquema incompatible en ${index.table}: faltan ${missingColumns.join(', ')}.`
            );
        }

        const definitions = collectIndexColumns(indexRows);
        const equivalentIndex = [...definitions.values()].some((columns) =>
            hasIndexPrefix(columns, index.columns)
        );
        if (equivalentIndex) {
            continue;
        }

        if (definitions.has(index.name.toLowerCase())) {
            throw new Error(`El índice ${index.name} existe con una definición incompatible.`);
        }

        pending.push(index);
    }

    for (const index of pending) {
        const columns = index.columns.map((column) => `\`${column}\``).join(', ');
        await connection.query(
            `ALTER TABLE \`${index.table}\` ADD INDEX \`${index.name}\` (${columns})`
        );
    }
}

const checksum = createHash('sha256')
    .update(
        `${JSON.stringify(indexes)}\n${collectIndexColumns.toString()}\n` +
            `${hasIndexPrefix.toString()}\n${up.toString()}`
    )
    .digest('hex');

module.exports = {
    id,
    checksum,
    up,
};
