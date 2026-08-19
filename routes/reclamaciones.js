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
        return sendInternalError(error, req, res);
    }
});

// Recontar item
router.post('/recontar', authorize({ module: 'reclamaciones', action: 'write' }), async (req, res) => {
    const { id_item, nuevo_valor } = req.body;
    const itemId = Number(id_item);
    const valor = Number(nuevo_valor);
    const emptyValue = nuevo_valor === null || nuevo_valor === undefined
        || (typeof nuevo_valor === 'string' && !nuevo_valor.trim());
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || emptyValue || !Number.isFinite(valor) || valor < 0) {
        return res.status(422).json({ success: false, error: 'El artículo y el conteo deben ser valores válidos.' });
    }
    try {
        const [result] = await pool.execute(
            `UPDATE historial_items hi
             INNER JOIN historial_remisiones hr ON hr.id = hi.remision_id
             SET hi.existencia_lapiz = ?
             WHERE hi.id = ? AND hi.revision_pendiente = 2 AND hr.estado <> 'FINALIZADO'`,
            [valor, itemId]
        );
        if (!result?.affectedRows) {
            return res.status(409).json({ success: false, error: 'El artículo ya no está pendiente de rectificación.' });
        }
        await logAudit(req.user.id, 'RECONTAR_RECLAMACION', `Reconteo de item ID ${itemId} a ${valor}`, req.requestId);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Validar item (admin)
router.post('/validar', authorize({ module: 'reclamaciones', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { id_item } = req.body;
    const itemId = Number(id_item);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
        return res.status(422).json({ success: false, error: 'El artículo no es válido.' });
    }
    try {
        const [result] = await pool.execute(
            `UPDATE historial_items hi
             INNER JOIN historial_remisiones hr ON hr.id = hi.remision_id
             SET hi.revision_pendiente = 0
             WHERE hi.id = ? AND hi.revision_pendiente = 2 AND hr.estado <> 'FINALIZADO'`,
            [itemId]
        );
        if (!result?.affectedRows) {
            return res.status(409).json({ success: false, error: 'El artículo ya no está pendiente de rectificación.' });
        }
        await logAudit(req.user.id, 'VALIDAR_RECLAMACION', `Item ID ${itemId} validado`, req.requestId);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

module.exports = router;
