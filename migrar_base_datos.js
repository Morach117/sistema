const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'importador_papeleria';

async function migrarBaseDatos() {
    console.log('====================================================');
    console.log('  Iniciando Migración de Base de Datos MySQL');
    console.log('====================================================');

    let connection;
    try {
        let successfulPort = 3306;
    const portsToTry = [3307, 3306];
    
    for (const port of portsToTry) {
        try {
            console.log(`Intentando conectar a MySQL en puerto ${port}...`);
            connection = await mysql.createConnection({
                host: DB_HOST,
                port: port,
                user: DB_USER,
                password: DB_PASSWORD
            });
            successfulPort = port;
            console.log(`[1/4] Conectado exitosamente a MySQL en ${DB_HOST}:${port}...`);
            
            // Guardar puerto exitoso para que Node y PHP lo lean rápido en el futuro
            try {
                const fs = require('fs');
                const path = require('path');
                fs.writeFileSync(path.join(__dirname, 'config', '.active_port'), port.toString());
            } catch(e) { /* Ignorar error al escribir */ }
            
            break; // Si conecta, salimos del bucle
        } catch (err) {
            console.log(`Fallo al conectar en puerto ${port}.`);
        }
    }
    
    if (!connection) {
        throw new Error("No se pudo conectar a MySQL en los puertos 3307 ni 3306. Verifica que XAMPP o MySQL esté iniciado.");
    }

        // 2. Crear BD si no existe
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        console.log(`[2/4] Base de datos '${DB_NAME}' verificada / creada.`);

        await connection.query(`USE \`${DB_NAME}\`;`);

        // 3. Crear tablas necesarias
        console.log('[3/4] Creando esquemas de tablas...');

        // Tabla usuarios
        await connection.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario VARCHAR(50) NOT NULL UNIQUE,
                nombre VARCHAR(100) NOT NULL,
                password VARCHAR(255) NOT NULL,
                rol ENUM('admin', 'empleado') DEFAULT 'empleado',
                activo TINYINT(1) DEFAULT 1,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla cat_productos
        await connection.query(`
            CREATE TABLE IF NOT EXISTS cat_productos (
                clave_sicar VARCHAR(50) PRIMARY KEY,
                codigo_barras VARCHAR(100),
                descripcion TEXT,
                precio_compra DECIMAL(10,2) DEFAULT 0.00,
                precio_venta DECIMAL(10,2) DEFAULT 0.00,
                existencia DECIMAL(10,2) DEFAULT 0.00,
                fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (codigo_barras)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla rel_codigos_proveedor
        await connection.query(`
            CREATE TABLE IF NOT EXISTS rel_codigos_proveedor (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo_proveedor VARCHAR(100) NOT NULL UNIQUE,
                clave_sicar VARCHAR(50) NOT NULL,
                es_paquete TINYINT(1) DEFAULT 1,
                piezas_por_paquete DECIMAL(10,2) DEFAULT 1.00,
                INDEX (clave_sicar)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla bodega_inventario
        await connection.query(`
            CREATE TABLE IF NOT EXISTS bodega_inventario (
                clave_sicar VARCHAR(50) PRIMARY KEY,
                existencia DECIMAL(10,2) DEFAULT 0.00,
                ubicacion VARCHAR(100) DEFAULT 'Bodega Principal',
                fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla historial_rapido (Captura)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS historial_rapido (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT DEFAULT 1,
                codigo VARCHAR(100) NOT NULL,
                clave_sicar VARCHAR(50),
                factor DECIMAL(10,2) DEFAULT 1.00,
                cantidad_bultos DECIMAL(10,2) DEFAULT 0.00,
                existencia DECIMAL(10,2) DEFAULT 0.00,
                total_unidades DECIMAL(10,2) DEFAULT 0.00,
                tipo_uso ENUM('VENTA', 'CONSUMO') DEFAULT 'VENTA',
                descripcion_cache TEXT,
                estatus TINYINT(1) DEFAULT 1,
                exportado TINYINT(1) DEFAULT 0,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla historial_remisiones
        await connection.query(`
            CREATE TABLE IF NOT EXISTS historial_remisiones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                numero_remision VARCHAR(100) NOT NULL UNIQUE,
                proveedor VARCHAR(100) DEFAULT 'MANUAL',
                fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP,
                estado ENUM('PENDIENTE', 'REVISION', 'FINALIZADO', 'ENVIADO') DEFAULT 'PENDIENTE'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla historial_items
        await connection.query(`
            CREATE TABLE IF NOT EXISTS historial_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                remision_id INT NOT NULL,
                codigo_proveedor VARCHAR(100),
                clave_sicar VARCHAR(50),
                clave_final VARCHAR(50),
                descripcion_original TEXT,
                cantidad DECIMAL(10,2) DEFAULT 0.00,
                costo_unitario DECIMAL(10,2) DEFAULT 0.00,
                existencia_lapiz DECIMAL(10,2) DEFAULT 0.00,
                es_paquete TINYINT(1) DEFAULT 0,
                piezas_por_paquete DECIMAL(10,2) DEFAULT 1.00,
                aplica_iva TINYINT(1) DEFAULT 0,
                aplica_descuento TINYINT(1) DEFAULT 0,
                aplica_descuento_manual TINYINT(1) NULL,
                revision_pendiente TINYINT(1) DEFAULT 0,
                INDEX (remision_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla historial_descargas_captura
        await connection.query(`
            CREATE TABLE IF NOT EXISTS historial_descargas_captura (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT DEFAULT 1,
                fecha_captura DATE NOT NULL,
                tipo_exportacion VARCHAR(50) NOT NULL,
                total_registros INT NOT NULL,
                nombre_archivo VARCHAR(255) NOT NULL,
                fecha_descarga DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla logs_auditoria
        await connection.query(`
            CREATE TABLE IF NOT EXISTS logs_auditoria (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT DEFAULT 1,
                accion VARCHAR(100) NOT NULL,
                detalle TEXT,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla configuracion_cajas
        await connection.query(`
            CREATE TABLE IF NOT EXISTS configuracion_cajas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo_barras VARCHAR(100) NOT NULL,
                clave_sicar VARCHAR(50) NOT NULL,
                cantidad_unidades INT DEFAULT 1,
                descripcion VARCHAR(255),
                estado VARCHAR(20) DEFAULT 'ACTIVO',
                modo_preferido VARCHAR(20) DEFAULT 'VENTA'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla logs_sistema
        await connection.query(`
            CREATE TABLE IF NOT EXISTS logs_sistema (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT DEFAULT 1,
                accion VARCHAR(50),
                modulo VARCHAR(50),
                detalles TEXT,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla bodega_movimientos
        await connection.query(`
            CREATE TABLE IF NOT EXISTS bodega_movimientos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clave_sicar VARCHAR(50) NOT NULL,
                tipo VARCHAR(20),
                cantidad INT DEFAULT 0,
                usuario_id INT DEFAULT 1,
                notas TEXT,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla producto_variantes
        await connection.query(`
            CREATE TABLE IF NOT EXISTS producto_variantes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clave_sicar VARCHAR(50) NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                factor INT DEFAULT 1,
                estado VARCHAR(20) DEFAULT 'ACTIVO',
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (clave_sicar)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Tabla usuario_permisos
        await connection.query(`
            CREATE TABLE IF NOT EXISTS usuario_permisos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                modulo VARCHAR(50) NOT NULL,
                permitido TINYINT(1) DEFAULT 1,
                UNIQUE KEY user_mod (usuario_id, modulo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 4. Insertar usuario admin por defecto si la tabla está vacía
        console.log('[4/4] Verificando usuarios por defecto...');
        const [users] = await connection.query('SELECT count(*) as total FROM usuarios');
        if (users[0].total === 0) {
            const bcrypt = require('bcryptjs');
            const hash = bcrypt.hashSync('admin123', 10);
            await connection.query(
                `INSERT INTO usuarios (usuario, nombre, password, rol, activo) VALUES ('admin', 'Administrador Principal', ?, 'admin', 1)`,
                [hash]
            );
            console.log('✔ Usuario administrador creado por defecto: (admin / admin123)');
        }

        console.log('\n====================================================');
        console.log('  ¡Migración completada con éxito!');
        console.log('====================================================\n');

    } catch (error) {
        console.error('\n✖ Error durante la migración:', error.message);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

migrarBaseDatos();
