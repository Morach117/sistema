const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sendInternalError } = require('../middleware/errors');

router.use(authMiddleware);
router.use(authorize({ module: 'evolucion-precios', action: 'read' }));

router.get('/', async (req, res) => {
    const q = (req.query.buscar_codigo || '').trim();
    if (!q) {
        return res.json({ success: true, data: [] });
    }

    try {
        const sql = `SELECT 
                    hi.id,
                    hi.codigo_proveedor,
                    hi.descripcion_original,
                    hi.cantidad,
                    hi.costo_unitario,
                    hi.es_paquete,
                    hi.piezas_por_paquete,
                    hi.aplica_iva,
                    hi.aplica_descuento,
                    hi.aplica_descuento_manual,
                    COALESCE(NULLIF(TRIM(hi.clave_final), ''), NULLIF(TRIM(rcp.clave_sicar), ''), TRIM(hi.codigo_proveedor)) as sicar,
                    COALESCE(MAX(cp.descripcion), hi.descripcion_original) as desc_final,
                    hr.proveedor,
                    hr.fecha_carga,
                    hr.numero_remision
                FROM historial_items hi
                JOIN historial_remisiones hr ON hi.remision_id = hr.id
                LEFT JOIN rel_codigos_proveedor rcp ON hi.codigo_proveedor = rcp.codigo_proveedor
                LEFT JOIN cat_productos cp ON (
                    cp.clave_sicar = hi.clave_final OR 
                    cp.clave_sicar = rcp.clave_sicar OR 
                    cp.codigo_barras = hi.codigo_proveedor
                )
                WHERE hr.estado = 'FINALIZADO' 
                AND (hi.clave_final IS NULL OR hi.clave_final NOT IN ('FALTANTE', 'DEVOLUCION'))
                AND (
                    hi.clave_final = ? OR 
                    hi.clave_sicar = ? OR 
                    hi.codigo_proveedor = ? OR
                    rcp.clave_sicar = ? OR
                    cp.clave_sicar = ? OR
                    cp.codigo_barras = ? OR
                    hi.descripcion_original LIKE ? OR
                    cp.descripcion LIKE ?
                )
                GROUP BY hi.id
                ORDER BY hr.fecha_carga DESC
                LIMIT 150`;

        const likeQ = `%${q}%`;
        const params = [q, q, q, q, q, q, likeQ, likeQ];

        const [rows] = await pool.execute(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

module.exports = router;
