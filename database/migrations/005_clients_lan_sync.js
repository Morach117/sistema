const { createHash } = require('node:crypto');

const id = '005_clients_lan_sync';
const uuidColumn = 'CHAR(36) CHARACTER SET ascii COLLATE ascii_bin';
const fingerprintColumn = 'CHAR(64) CHARACTER SET ascii COLLATE ascii_bin';

const statements = [
    `
    CREATE TABLE IF NOT EXISTS \`sucursales\` (
        \`id\` ${uuidColumn} NOT NULL,
        \`nombre\` VARCHAR(120) NOT NULL,
        \`rol_nodo\` VARCHAR(20) NOT NULL,
        \`public_key\` TEXT NULL,
        \`key_fingerprint\` ${fingerprintColumn} NULL,
        \`credential\` TEXT NULL,
        \`ultimo_cursor_enviado\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
        \`ultimo_cursor_recibido\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
        \`ultima_sincronizacion_en\` DATETIME(3) NULL,
        \`activo\` TINYINT(1) NOT NULL DEFAULT 1,
        \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`actualizado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_sucursales_activo_nombre\` (\`activo\`, \`nombre\`),
        INDEX \`idx_sucursales_fingerprint\` (\`key_fingerprint\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`,
    `
    CREATE TABLE IF NOT EXISTS \`clientes\` (
        \`id\` ${uuidColumn} NOT NULL,
        \`origen_sucursal_id\` ${uuidColumn} NOT NULL,
        \`nombre\` VARCHAR(180) NOT NULL,
        \`telefono\` VARCHAR(40) NULL,
        \`correo\` VARCHAR(254) NULL,
        \`notas\` TEXT NULL,
        \`activo\` TINYINT(1) NOT NULL DEFAULT 1,
        \`version\` BIGINT UNSIGNED NOT NULL DEFAULT 1,
        \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`actualizado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_clientes_nombre\` (\`nombre\`),
        INDEX \`idx_clientes_telefono\` (\`telefono\`),
        INDEX \`idx_clientes_activo_actualizado\` (\`activo\`, \`actualizado_en\`),
        INDEX \`idx_clientes_origen\` (\`origen_sucursal_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`,
    `
    CREATE TABLE IF NOT EXISTS \`cliente_compras\` (
        \`id\` ${uuidColumn} NOT NULL,
        \`cliente_id\` ${uuidColumn} NOT NULL,
        \`sucursal_id\` ${uuidColumn} NOT NULL,
        \`folio_ticket\` VARCHAR(100) NULL,
        \`total\` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        \`detalle\` JSON NULL,
        \`fecha_compra\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`version\` BIGINT UNSIGNED NOT NULL DEFAULT 1,
        \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`actualizado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_cliente_compras_sucursal_folio\` (\`sucursal_id\`, \`folio_ticket\`),
        INDEX \`idx_cliente_compras_cliente_fecha\` (\`cliente_id\`, \`fecha_compra\`),
        INDEX \`idx_cliente_compras_sucursal_fecha\` (\`sucursal_id\`, \`fecha_compra\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`,
    `
    CREATE TABLE IF NOT EXISTS \`cliente_operaciones_sync\` (
        \`id\` ${uuidColumn} NOT NULL,
        \`cursor_local\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`sucursal_id\` ${uuidColumn} NOT NULL,
        \`entidad\` VARCHAR(40) NOT NULL,
        \`entidad_id\` ${uuidColumn} NOT NULL,
        \`tipo_operacion\` VARCHAR(40) NOT NULL,
        \`payload\` JSON NOT NULL,
        \`version\` BIGINT UNSIGNED NOT NULL,
        \`estado\` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        \`intentos\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`ultimo_error\` TEXT NULL,
        \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`sincronizado_en\` DATETIME(3) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_cliente_sync_cursor_local\` (\`cursor_local\`),
        INDEX \`idx_cliente_sync_estado_creado\` (\`estado\`, \`creado_en\`),
        INDEX \`idx_cliente_sync_entidad\` (\`entidad\`, \`entidad_id\`),
        INDEX \`idx_cliente_sync_sucursal\` (\`sucursal_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`,
    `
    CREATE TABLE IF NOT EXISTS \`cliente_conflictos\` (
        \`id\` ${uuidColumn} NOT NULL,
        \`sucursal_id\` ${uuidColumn} NOT NULL,
        \`entidad\` VARCHAR(40) NOT NULL,
        \`entidad_id\` ${uuidColumn} NOT NULL,
        \`payload_local\` JSON NOT NULL,
        \`payload_remoto\` JSON NOT NULL,
        \`estado\` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        \`resolucion\` JSON NULL,
        \`detectado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`resuelto_en\` DATETIME(3) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_cliente_conflictos_estado_fecha\` (\`estado\`, \`detectado_en\`),
        INDEX \`idx_cliente_conflictos_entidad\` (\`entidad\`, \`entidad_id\`),
        INDEX \`idx_cliente_conflictos_sucursal\` (\`sucursal_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`,
    `
    CREATE TABLE IF NOT EXISTS \`cliente_bitacora\` (
        \`id\` ${uuidColumn} NOT NULL,
        \`sucursal_id\` ${uuidColumn} NOT NULL,
        \`usuario_id\` BIGINT UNSIGNED NULL,
        \`entidad\` VARCHAR(40) NOT NULL,
        \`entidad_id\` ${uuidColumn} NOT NULL,
        \`accion\` VARCHAR(60) NOT NULL,
        \`detalle\` JSON NULL,
        \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_cliente_bitacora_entidad\` (\`entidad\`, \`entidad_id\`),
        INDEX \`idx_cliente_bitacora_sucursal_fecha\` (\`sucursal_id\`, \`creado_en\`),
        INDEX \`idx_cliente_bitacora_usuario_fecha\` (\`usuario_id\`, \`creado_en\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`,
    `
    CREATE TABLE IF NOT EXISTS \`cliente_configuracion\` (
        \`id\` ${uuidColumn} NOT NULL,
        \`alcance_local\` TINYINT UNSIGNED NOT NULL DEFAULT 1,
        \`sucursal_id\` ${uuidColumn} NOT NULL,
        \`rol_nodo\` VARCHAR(20) NOT NULL,
        \`central_fingerprint\` ${fingerprintColumn} NULL,
        \`central_public_key\` TEXT NULL,
        \`central_private_key\` TEXT NULL,
        \`sucursal_public_key\` TEXT NULL,
        \`sucursal_private_key\` TEXT NULL,
        \`sucursal_credential\` TEXT NULL,
        \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`actualizado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`chk_cliente_configuracion_local\` CHECK (\`alcance_local\` = 1),
        UNIQUE KEY \`uq_cliente_configuracion_local\` (\`alcance_local\`),
        UNIQUE KEY \`uq_cliente_configuracion_sucursal\` (\`sucursal_id\`),
        INDEX \`idx_cliente_configuracion_fingerprint\` (\`central_fingerprint\`)
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
