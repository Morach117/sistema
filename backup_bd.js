const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const defaultEnv = `PORT=3000\nDB_HOST=127.0.0.1\nDB_USER=root\nDB_PASSWORD=\nDB_NAME=importador_papeleria\nJWT_SECRET=super_secret_key_12345\n`;
    fs.writeFileSync(envPath, defaultEnv);
}
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'importador_papeleria';

const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

const now = new Date();
const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
const backupFile = path.join(backupDir, `backup_${DB_NAME}_${timestamp}.sql`);

console.log(`📦 Creando respaldo automático de la BD '${DB_NAME}'...`);

let dumpCmd = `mysqldump -h ${DB_HOST} -u ${DB_USER} ${DB_PASSWORD ? `-p"${DB_PASSWORD}"` : ''} ${DB_NAME} > "${backupFile}"`;
const xamppDump = 'C:\\xampp\\mysql\\bin\\mysqldump.exe';

if (fs.existsSync(xamppDump)) {
    dumpCmd = `"${xamppDump}" -h ${DB_HOST} -u ${DB_USER} ${DB_PASSWORD ? `-p"${DB_PASSWORD}"` : ''} ${DB_NAME} > "${backupFile}"`;
}

exec(dumpCmd, (error, stdout, stderr) => {
    if (error) {
        console.error('⚠️ Aviso en respaldo (se continuará de forma segura):', error.message);
    } else {
        console.log(`✔ Respaldo guardado exitosamente en: ${backupFile}`);
    }
});
