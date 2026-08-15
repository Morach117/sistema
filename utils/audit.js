const pool = require('../config/database');
const { log } = require('./logger');

async function logAudit(usuario_id, accion, detalle = null, requestId) {
    try {
        if (!usuario_id) return;
        const sql = `INSERT INTO logs_auditoria (usuario_id, accion, detalle, fecha) VALUES (?, ?, ?, NOW())`;
        await pool.execute(sql, [usuario_id, accion, detalle]);
    } catch (error) {
        log('error', 'Failed to record audit event', { requestId, error });
    }
}

module.exports = { logAudit };
