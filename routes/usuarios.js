const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize, denyAccess, moduleAllowlist } = require('../middleware/authorize');
const { releaseConnection, rollbackTransaction, sendInternalError } = require('../middleware/errors');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/audit');

router.use(authMiddleware);
router.use(authorize({ module: 'usuarios', action: 'read' }));

function validationError(message) {
    const error = new TypeError(message);
    error.status = 400;
    error.isPublic = true;
    return error;
}

async function savePermissions({ usuario_id, permisos, requestId }, database = pool) {
    if (!Number.isInteger(usuario_id) || usuario_id <= 0) {
        throw validationError('El usuario_id debe ser un entero positivo.');
    }
    if (!Array.isArray(permisos)) {
        throw validationError('Los permisos deben ser una lista.');
    }

    const uniquePermissions = [...new Set(permisos)];
    for (const module of uniquePermissions) {
        if (!moduleAllowlist.has(module)) {
            throw validationError(`El módulo no está permitido: ${module}`);
        }
    }

    let connection;
    try {
        connection = await database.getConnection();
        await connection.beginTransaction();
        await connection.execute('DELETE FROM usuario_permisos WHERE usuario_id = ?', [usuario_id]);
        for (const module of uniquePermissions) {
            await connection.execute(
                'INSERT INTO usuario_permisos (usuario_id, modulo, permitido) VALUES (?, ?, 1)',
                [usuario_id, module]
            );
        }
        await connection.commit();
    } catch (error) {
        await rollbackTransaction(connection, requestId);
        throw error;
    } finally {
        releaseConnection(connection, requestId);
    }
}

router.get('/listar', async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    try {
        const [rows] = await pool.execute('SELECT id, nombre, usuario, rol, activo FROM usuarios');
        res.json(rows);
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

router.post('/guardar', authorize({ module: 'usuarios', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    
    const { id, nombre, usuario, rol, password } = req.body;

    try {
        if (!id) {
            // Nuevo
            if (!password) throw new Error("Contraseña requerida");
            const hash = await bcrypt.hash(password, 10);
            await pool.execute('INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)', [nombre, usuario, hash, rol]);
            await logAudit(req.user.id, 'CREAR_USUARIO', `Creado usuario ${usuario} (${rol})`, req.requestId);
        } else {
            // Editar
            if (password) {
                const hash = await bcrypt.hash(password, 10);
                await pool.execute('UPDATE usuarios SET nombre=?, usuario=?, rol=?, password=? WHERE id=?', [nombre, usuario, rol, hash, id]);
            } else {
                await pool.execute('UPDATE usuarios SET nombre=?, usuario=?, rol=? WHERE id=?', [nombre, usuario, rol, id]);
            }
            await logAudit(req.user.id, 'EDITAR_USUARIO', `Editado usuario ID ${id} (${usuario})`, req.requestId);
        }
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

router.post('/eliminar', authorize({ module: 'usuarios', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { id } = req.body;
    try {
        await pool.execute('DELETE FROM usuarios WHERE id = ?', [id]);
        await logAudit(req.user.id, 'ELIMINAR_USUARIO', `Eliminado usuario ID ${id}`, req.requestId);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

router.get('/logs', async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    try {
        const sql = `SELECT l.id, u.usuario as autor, l.accion, l.detalle, l.fecha 
                     FROM logs_auditoria l
                     JOIN usuarios u ON l.usuario_id = u.id
                     ORDER BY l.fecha DESC LIMIT 100`;
        const [rows] = await pool.execute(sql);
        res.json(rows);
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});



router.get('/permisos/:id', async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    try {
        const [rows] = await pool.execute('SELECT modulo FROM usuario_permisos WHERE usuario_id = ? AND permitido = 1', [req.params.id]);
        const permisos = rows.map(r => r.modulo);
        res.json({ success: true, permisos });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

router.post('/permisos/guardar', authorize({ module: 'usuarios', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { usuario_id, modulos } = req.body;
    try {
        await savePermissions({ usuario_id, permisos: modulos, requestId: req.requestId });
        await logAudit(req.user.id, 'EDITAR_PERMISOS', `Editados permisos de usuario ID ${usuario_id}`, req.requestId);
        res.json({ success: true });
    } catch (error) {
        if (error.status === 400 && error.isPublic === true) {
            return res.status(400).json({ success: false, error: error.message });
        }
        return sendInternalError(error, req, res);
    }
});

module.exports = router;
module.exports.savePermissions = savePermissions;
