const { createHash } = require('node:crypto');

const id = '001_migration_history';
const sql = `
    CREATE TABLE IF NOT EXISTS \`_node_migrations\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`checksum\` CHAR(64) NOT NULL,
        \`applied_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`app_version\` VARCHAR(64) NOT NULL,
        PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

module.exports = {
    id,
    checksum: createHash('sha256').update(sql).digest('hex'),
    async up(connection) {
        await connection.query(sql);
    },
};
