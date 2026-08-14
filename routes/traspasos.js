const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize, denyAccess } = require('../middleware/authorize');
const { releaseConnection, rollbackTransaction, sendInternalError } = require('../middleware/errors');

router.use(authMiddleware);

// GET /api/traspasos/buscar?q=
router.get('/buscar', authorize({ module: 'traspasos', action: 'read' }), async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ success: false, error: 'Query is empty' });

    try {
        // Buscar coincidencia exacta
        const sqlExact = `SELECT clave_sicar as id, clave_sicar as codigo, descripcion, existencia as stock_matriz 
                          FROM cat_productos 
                          WHERE clave_sicar = ? OR codigo_barras = ? LIMIT 1`;
        const [exact] = await pool.execute(sqlExact, [q, q]);
        
        if (exact.length > 0) {
            return res.json({ success: true, exacto: true, data: exact[0] });
        }

        // Buscar coincidencias similares
        const sqlLike = `SELECT clave_sicar as id, clave_sicar as codigo, descripcion, existencia as stock_matriz 
                         FROM cat_productos 
                         WHERE descripcion LIKE ? LIMIT 10`;
        const [similares] = await pool.execute(sqlLike, [`%${q}%`]);
        
        if (similares.length > 0) {
            return res.json({ success: true, exacto: false, data: similares });
        } else {
            return res.status(404).json({ success: false, error: 'Producto no encontrado en el catálogo' });
        }
    } catch (error) {
        console.error(error);
        return sendInternalError(error, req, res);
    }
});

// POST /api/traspasos/guardar
router.post('/guardar', authorize({ module: 'traspasos', action: 'write' }), async (req, res) => {
    const usuario_id = req.user.id;
    const { productos } = req.body;

    if (!productos || productos.length === 0) {
        return res.status(400).json({ success: false, error: 'No hay productos para traspasar' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.execute(
            `INSERT INTO traspasos (usuario_creador_id, fecha, estado) VALUES (?, NOW(), 'PENDIENTE')`,
            [usuario_id]
        );
        const traspaso_id = result.insertId;

        const stmtDetalle = `INSERT INTO traspaso_detalles (traspaso_id, clave_sicar, cantidad) VALUES (?, ?, ?)`;
        
        for (const prod of productos) {
            await connection.execute(stmtDetalle, [traspaso_id, prod.id, prod.cantidad]);
        }

        await connection.commit();
        res.json({ success: true, message: `Orden de traspaso #${traspaso_id} guardada con éxito.` });
    } catch (error) {
        await rollbackTransaction(connection, req.requestId);
        console.error(error);
        return sendInternalError(error, req, res);
    } finally {
        releaseConnection(connection, req.requestId);
    }
});
// Admin: Listar traspasos
router.get('/admin_list', authorize({ module: 'admin-traspasos', action: 'read' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    try {
        const sql = `
            SELECT t.id, t.fecha, t.estado, u.usuario as origen,
                   (SELECT SUM(cantidad) FROM traspaso_detalles WHERE traspaso_id = t.id) as total_piezas,
                   (SELECT COUNT(*) FROM traspaso_detalles WHERE traspaso_id = t.id) as total_codigos
            FROM traspasos t
            LEFT JOIN usuarios u ON t.usuario_creador_id = u.id
            ORDER BY t.fecha DESC
        `;
        const [rows] = await pool.execute(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        return sendInternalError(error, req, res);
    }
});

// Admin: Detalle de traspaso
router.get('/:id', authorize({ module: 'admin-traspasos', action: 'read' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    try {
        const sql = `
            SELECT d.id as detalle_id, d.clave_sicar, d.cantidad, c.descripcion
            FROM traspaso_detalles d
            LEFT JOIN cat_productos c ON d.clave_sicar = c.clave_sicar
            WHERE d.traspaso_id = ?
        `;
        const [rows] = await pool.execute(sql, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        return sendInternalError(error, req, res);
    }
});

// Admin: Completar y Autorizar
router.post('/completar', authorize({ module: 'admin-traspasos', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { id_traspaso, detalles } = req.body;
    
    if (!id_traspaso || !detalles) return res.status(400).json({ error: 'Datos incompletos' });

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Actualizar cantidades
        for (const det of detalles) {
            await connection.execute(
                `UPDATE traspaso_detalles SET cantidad = ? WHERE id = ?`,
                [det.cantidad_recibida, det.detalle_id]
            );
        }

        // Marcar como completado
        await connection.execute(`UPDATE traspasos SET estado = 'COMPLETADO' WHERE id = ?`, [id_traspaso]);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await rollbackTransaction(connection, req.requestId);
        console.error(error);
        return sendInternalError(error, req, res);
    } finally {
        releaseConnection(connection, req.requestId);
    }
});

module.exports = router;
