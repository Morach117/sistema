const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize, denyAccess } = require('../middleware/authorize');
const { releaseConnection, rollbackTransaction, sendInternalError } = require('../middleware/errors');

router.use(authMiddleware);
router.use(authorize({ module: 'bodega', action: 'read' }));

router.get('/', async (req, res) => {
    const q = req.query.q || '';
    try {
        let sql = `SELECT c.clave_sicar, c.descripcion, b.existencia, COALESCE(b.ubicacion, 'Sin Ubicación') as ubicacion, b.fecha_actualizacion 
                   FROM bodega_inventario b 
                   JOIN cat_productos c ON b.clave_sicar = c.clave_sicar
                   WHERE b.existencia > 0`;
        let params = [];

        if (q) {
            sql += ` AND (c.clave_sicar LIKE ? OR c.descripcion LIKE ?)`;
            params = [`%${q}%`, `%${q}%`];
        } else {
            sql += ` ORDER BY b.fecha_actualizacion DESC, c.fecha_actualizacion DESC LIMIT 100`;
        }

        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

router.post('/guardar', authorize({ module: 'bodega', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') {
        return denyAccess(res);
    }

    const clave = req.body.clave_sicar || '';
    const tipo = req.body.tipo || '';
    const cantidad = parseFloat(req.body.cantidad || 0);
    const ubicacion = req.body.ubicacion || 'Bodega Principal';
    const notas = req.body.notas || '';
    const usuario_id = req.user.id;

    if (!clave || !tipo || cantidad <= 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos o cantidad inválida' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [catCheck] = await connection.execute('SELECT clave_sicar FROM cat_productos WHERE clave_sicar = ?', [clave]);
        if (catCheck.length === 0) {
            throw new Error(`El producto con clave ${clave} no existe en el catálogo principal.`);
        }
        const exactClave = catCheck[0].clave_sicar;

        const [bodCheck] = await connection.execute('SELECT existencia FROM bodega_inventario WHERE clave_sicar = ? FOR UPDATE', [exactClave]);
        
        let existencia_actual = bodCheck.length > 0 ? parseFloat(bodCheck[0].existencia) : 0;
        let nueva_existencia = existencia_actual;

        if (tipo === 'ENTRADA') nueva_existencia += cantidad;
        else if (tipo === 'SALIDA') {
            if (existencia_actual < cantidad) throw new Error('Stock insuficiente en bodega');
            nueva_existencia -= cantidad;
        } 
        else if (tipo === 'AJUSTE') nueva_existencia = cantidad;

        if (bodCheck.length > 0) {
            await connection.execute('UPDATE bodega_inventario SET existencia = ?, ubicacion = ? WHERE clave_sicar = ?', [nueva_existencia, ubicacion, exactClave]);
        } else {
            await connection.execute('INSERT INTO bodega_inventario (clave_sicar, existencia, ubicacion) VALUES (?, ?, ?)', [exactClave, nueva_existencia, ubicacion]);
        }

        await connection.execute('INSERT INTO bodega_movimientos (clave_sicar, tipo, cantidad, usuario_id, notas) VALUES (?, ?, ?, ?, ?)', [exactClave, tipo, cantidad, usuario_id, notas]);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await rollbackTransaction(connection, req.requestId);
        return sendInternalError(error, req, res);
    } finally {
        releaseConnection(connection, req.requestId);
    }
});

router.post('/eliminar', authorize({ module: 'bodega', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') {
        return denyAccess(res);
    }

    const clave = req.body.clave_sicar || '';
    if (!clave) return res.status(400).json({ success: false, error: 'Clave de producto requerida' });

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await connection.execute('DELETE FROM bodega_inventario WHERE clave_sicar = ?', [clave]);
        await connection.execute('INSERT INTO bodega_movimientos (clave_sicar, tipo, cantidad, usuario_id, notas) VALUES (?, "AJUSTE", 0, ?, "Registro de bodega eliminado")', [clave, req.user.id]);
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await rollbackTransaction(connection, req.requestId);
        return sendInternalError(error, req, res);
    } finally {
        releaseConnection(connection, req.requestId);
    }
});

router.get('/buscar/:clave', async (req, res) => {
    try {
        const clave = req.params.clave;
        const sql = `SELECT c.clave_sicar, c.descripcion, COALESCE(b.existencia, 0) as existencia, COALESCE(b.ubicacion, 'Bodega Principal') as ubicacion 
                     FROM cat_productos c 
                     LEFT JOIN bodega_inventario b ON c.clave_sicar = b.clave_sicar
                     WHERE c.clave_sicar = ? OR c.codigo_barras = ?`;
        const [rows] = await pool.execute(sql, [clave, clave]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado en el Catálogo Maestro' });
        }
        res.json(rows[0]);
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

router.post('/guardar-lote', authorize({ module: 'bodega', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') {
        return denyAccess(res);
    }

    const { movimientos } = req.body;
    if (!movimientos || !Array.isArray(movimientos) || movimientos.length === 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos o inválidos' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        for (const mov of movimientos) {
            const { clave_sicar, cantidad, ubicacion } = mov;
            const cantidadNum = parseFloat(cantidad || 0);

            if (cantidadNum === 0) continue;

            const [catCheck] = await connection.execute('SELECT clave_sicar FROM cat_productos WHERE clave_sicar = ?', [clave_sicar]);
            if (catCheck.length === 0) continue;
            const exactClave = catCheck[0].clave_sicar;

            const [bodCheck] = await connection.execute('SELECT existencia FROM bodega_inventario WHERE clave_sicar = ? FOR UPDATE', [exactClave]);
            
            let nueva_existencia = cantidadNum; 
            
            const tipo = 'AJUSTE';
            const ubi = ubicacion || 'Bodega Principal';

            if (bodCheck.length > 0) {
                await connection.execute('UPDATE bodega_inventario SET existencia = ?, ubicacion = ? WHERE clave_sicar = ?', [nueva_existencia, ubi, exactClave]);
            } else {
                await connection.execute('INSERT INTO bodega_inventario (clave_sicar, existencia, ubicacion) VALUES (?, ?, ?)', [exactClave, nueva_existencia, ubi]);
            }

            await connection.execute('INSERT INTO bodega_movimientos (clave_sicar, tipo, cantidad, usuario_id, notas) VALUES (?, ?, ?, ?, ?)', [exactClave, tipo, nueva_existencia, req.user.id, 'Ajuste masivo por escáner']);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await rollbackTransaction(connection, req.requestId);
        return sendInternalError(error, req, res);
    } finally {
        releaseConnection(connection, req.requestId);
    }
});

router.get('/:clave/historial', async (req, res) => {
    try {
        const clave = req.params.clave;
        const [rows] = await pool.execute(`
            SELECT m.*, u.nombre as usuario
            FROM bodega_movimientos m
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            WHERE m.clave_sicar = ?
            ORDER BY m.fecha DESC
        `, [clave]);
        
        res.json({ success: true, data: rows });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

router.post('/bajar-lote', authorize({ module: 'bodega', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') {
        return denyAccess(res);
    }

    const { movimientos } = req.body;
    if (!movimientos || !Array.isArray(movimientos) || movimientos.length === 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos o inválidos' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        for (const mov of movimientos) {
            const { clave_sicar, cantidad_bajar, notas } = mov;
            const cantidadNum = parseFloat(cantidad_bajar || 0);

            if (cantidadNum <= 0) continue;

            const [bodCheck] = await connection.execute('SELECT existencia FROM bodega_inventario WHERE clave_sicar = ? FOR UPDATE', [clave_sicar]);
            
            if (bodCheck.length === 0) {
                throw new Error(`El producto con clave ${clave_sicar} no existe en bodega.`);
            }

            let existencia_actual = parseFloat(bodCheck[0].existencia);
            if (existencia_actual < cantidadNum) {
                throw new Error(`Stock insuficiente para el producto ${clave_sicar}. Existencia actual: ${existencia_actual}`);
            }

            let nueva_existencia = existencia_actual - cantidadNum; 
            
            const tipo = 'SALIDA';
            const ubi = 'Bodega Principal'; // O la que ya tenga
            const notasCompletas = notas ? `Baja por selección: ${notas}` : 'Baja por selección desde inventario';

            if (nueva_existencia === 0) {
                 // Si llega a 0, podríamos dejar el registro en 0 para que no desaparezca de golpe, 
                 // o eliminarlo. Lo dejaremos en 0 para que quede el registro del producto.
                 await connection.execute('UPDATE bodega_inventario SET existencia = ? WHERE clave_sicar = ?', [0, clave_sicar]);
            } else {
                 await connection.execute('UPDATE bodega_inventario SET existencia = ? WHERE clave_sicar = ?', [nueva_existencia, clave_sicar]);
            }

            await connection.execute('INSERT INTO bodega_movimientos (clave_sicar, tipo, cantidad, usuario_id, notas) VALUES (?, ?, ?, ?, ?)', [clave_sicar, tipo, cantidadNum, req.user.id, notasCompletas]);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await rollbackTransaction(connection, req.requestId);
        return sendInternalError(error, req, res);
    } finally {
        releaseConnection(connection, req.requestId);
    }
});

module.exports = router;
