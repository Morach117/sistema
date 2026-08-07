const pool = require('./config/database');

async function migrate() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS evolucion_precios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clave_sicar VARCHAR(100) NOT NULL,
                precio_anterior DECIMAL(10,2) NOT NULL,
                precio_nuevo DECIMAL(10,2) NOT NULL,
                usuario_id INT NOT NULL,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS reclamaciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clave_sicar VARCHAR(100) NOT NULL,
                tipo ENUM('CLIENTE', 'INTERNO', 'PROVEEDOR') NOT NULL,
                motivo TEXT NOT NULL,
                estado ENUM('ABIERTA', 'EN_REVISION', 'RESUELTA') DEFAULT 'ABIERTA',
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS recepciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                origen VARCHAR(255) NOT NULL,
                estado ENUM('RECIBIDO', 'PENDIENTE') DEFAULT 'RECIBIDO',
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Migraciones ejecutadas correctamente.");
    } catch (error) {
        console.error("Error en migracion:", error);
    } finally {
        process.exit(0);
    }
}

migrate();
