const pool = require('../config/database');

async function logAudit(usuario_id, accion, detalle = null) {
    try {
        if (!usuario_id) return;
        const sql = `INSERT INTO logs_auditoria (usuario_id, accion, detalle, fecha) VALUES (?, ?, ?, NOW())`;
        await pool.execute(sql, [usuario_id, accion, detalle]);
    } catch (error) {
        console.error('Error al registrar auditoría:', error);
    }
}

module.exports = { logAudit };
