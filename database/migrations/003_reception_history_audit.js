const { createHash } = require('node:crypto');

const id = '003_reception_history_audit';
const statements = [
    `
    CREATE TABLE IF NOT EXISTS \`recepcion_notas\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`remision_id\` BIGINT UNSIGNED NOT NULL,
        \`item_id\` BIGINT UNSIGNED NULL,
        \`nota\` TEXT NOT NULL,
        \`creado_por\` BIGINT UNSIGNED NOT NULL,
        \`fecha\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_recepcion_notas_remision\` (\`remision_id\`),
        INDEX \`idx_recepcion_notas_item\` (\`item_id\`),
        INDEX \`idx_recepcion_notas_fecha\` (\`fecha\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`,
    `
    CREATE TABLE IF NOT EXISTS \`recepcion_bitacora\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`remision_id\` BIGINT UNSIGNED NOT NULL,
        \`item_id\` BIGINT UNSIGNED NULL,
        \`usuario_id\` BIGINT UNSIGNED NOT NULL,
        \`campo\` VARCHAR(120) NOT NULL,
        \`valor_anterior\` TEXT NULL,
        \`valor_nuevo\` TEXT NULL,
        \`fecha\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_recepcion_bitacora_remision\` (\`remision_id\`),
        INDEX \`idx_recepcion_bitacora_item\` (\`item_id\`),
        INDEX \`idx_recepcion_bitacora_fecha\` (\`fecha\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`,
];

module.exports = {
    id,
    checksum: createHash('sha256').update(statements.join('\n')).digest('hex'),
    async up(connection) {
        for (const statement of statements) {
            await connection.query(statement);
        }
    },
};
