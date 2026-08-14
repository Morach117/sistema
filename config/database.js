const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Leer el puerto activo que ya se determinó y guardó en caché (compartido con PHP/Migraciones)
let dbPort = 3306; // Default
const portFile = path.join(__dirname, '.active_port');
try {
    if (fs.existsSync(portFile)) {
        dbPort = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);
    }
} catch (err) {
    // Ignorar si no se puede leer
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || dbPort,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'importador_papeleria',
    multipleStatements: false,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
