const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize, denyAccess } = require('../middleware/authorize');
const { sendInternalError } = require('../middleware/errors');
const { logAudit } = require('../utils/audit');

router.use(authMiddleware);
router.use(authorize({ module: 'reclamaciones', action: 'read' }));

// Get pendientes
router.get('/', async (req, res) => {
    try {
        const sql = `SELECT hr.id, hr.numero_remision, hr.fecha_carga, hr.proveedor,
                    (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id AND revision_pendiente = 2) as items_pendientes
                    FROM historial_remisiones hr
                    WHERE EXISTS (
                        SELECT 1 FROM historial_items 
                        WHERE remision_id = hr.id AND revision_pendiente = 2
                    )
                    ORDER BY hr.fecha_carga DESC`;
        const [rows] = await pool.execute(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        return sendInternalError(error, req, res);
    }
});

// Leer faltantes de una remision
router.get('/:id', async (req, res) => {
    try {
        const sql = `SELECT * FROM historial_items WHERE remision_id = ? AND revision_pendiente = 2`;
        const [items] = await pool.execute(sql, [req.params.id]);
        res.json({ success: true, items });
    } catch (error) {
        console.error(error);
        return sendInternalError(error, req, res);
    }
});

// Recontar item
router.post('/recontar', authorize({ module: 'reclamaciones', action: 'write' }), async (req, res) => {
    const { id_item, nuevo_valor } = req.body;
    try {
        await pool.execute(`UPDATE historial_items SET existencia_lapiz = ? WHERE id = ?`, [nuevo_valor, id_item]);
        await logAudit(req.user.id, 'RECONTAR_RECLAMACION', `Reconteo de item ID ${id_item} a ${nuevo_valor}`);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        return sendInternalError(error, req, res);
    }
});

// Validar item (admin)
router.post('/validar', authorize({ module: 'reclamaciones', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { id_item } = req.body;
    try {
        await pool.execute(`UPDATE historial_items SET revision_pendiente = 0 WHERE id = ?`, [id_item]);
        await logAudit(req.user.id, 'VALIDAR_RECLAMACION', `Item ID ${id_item} validado`);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        return sendInternalError(error, req, res);
    }
});

module.exports = router;
