const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/audit');

router.use(authMiddleware);

router.get('/listar', async (req, res) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Denegado' });
    try {
        const [rows] = await pool.execute('SELECT id, nombre, usuario, rol, activo FROM usuarios');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/guardar', async (req, res) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ success: false, error: 'Denegado' });
    
    const { id, nombre, usuario, rol, password } = req.body;

    try {
        if (!id) {
            // Nuevo
            if (!password) throw new Error("Contraseña requerida");
            const hash = await bcrypt.hash(password, 10);
            await pool.execute('INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)', [nombre, usuario, hash, rol]);
            await logAudit(req.user.id, 'CREAR_USUARIO', `Creado usuario ${usuario} (${rol})`);
        } else {
            // Editar
            if (password) {
                const hash = await bcrypt.hash(password, 10);
                await pool.execute('UPDATE usuarios SET nombre=?, usuario=?, rol=?, password=? WHERE id=?', [nombre, usuario, rol, hash, id]);
            } else {
                await pool.execute('UPDATE usuarios SET nombre=?, usuario=?, rol=? WHERE id=?', [nombre, usuario, rol, id]);
            }
            await logAudit(req.user.id, 'EDITAR_USUARIO', `Editado usuario ID ${id} (${usuario})`);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/eliminar', async (req, res) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ success: false, error: 'Denegado' });
    const { id } = req.body;
    try {
        await pool.execute('DELETE FROM usuarios WHERE id = ?', [id]);
        await logAudit(req.user.id, 'ELIMINAR_USUARIO', `Eliminado usuario ID ${id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/logs', async (req, res) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Denegado' });
    try {
        const sql = `SELECT l.id, u.usuario as autor, l.accion, l.detalle, l.fecha 
                     FROM logs_auditoria l
                     JOIN usuarios u ON l.usuario_id = u.id
                     ORDER BY l.fecha DESC LIMIT 100`;
        const [rows] = await pool.execute(sql);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



router.get('/permisos/:id', async (req, res) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Denegado' });
    try {
        const [rows] = await pool.execute('SELECT modulo FROM usuario_permisos WHERE usuario_id = ? AND permitido = 1', [req.params.id]);
        const permisos = rows.map(r => r.modulo);
        res.json({ success: true, permisos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/permisos/guardar', async (req, res) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Denegado' });
    const { usuario_id, modulos } = req.body;
    try {
        // Start transaction if possible, or just delete and insert
        await pool.execute('DELETE FROM usuario_permisos WHERE usuario_id = ?', [usuario_id]);
        
        if (modulos && modulos.length > 0) {
            const values = modulos.map(m => `(${usuario_id}, '${m}', 1)`).join(',');
            await pool.query(`INSERT INTO usuario_permisos (usuario_id, modulo, permitido) VALUES ${values}`);
        }
        await logAudit(req.user.id, 'EDITAR_PERMISOS', `Editados permisos de usuario ID ${usuario_id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
