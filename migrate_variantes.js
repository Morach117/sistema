const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
    try {
        const pool = mysql.createPool({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'sistema' });
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS producto_variantes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clave_sicar VARCHAR(50) NOT NULL,
                nombre VARCHAR(255) NOT NULL,
                factor INT NOT NULL,
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
                estado ENUM('ACTIVO','INACTIVO') DEFAULT 'ACTIVO'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('Tabla producto_variantes creada');
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
