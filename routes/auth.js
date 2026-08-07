const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

router.post('/login', async (req, res) => {
    const { usuario, password } = req.body;
    
    if (!usuario || !password) {
        return res.status(400).json({ success: false, error: 'Faltan credenciales' });
    }

    try {
        const [rows] = await pool.execute('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
        
        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
        }

        const user = rows[0];
        
        if (user.activo === 0) {
            return res.status(403).json({ success: false, error: 'Usuario inactivo' });
        }

        // PHP's password_hash often uses $2y$, bcryptjs expects $2a$ for the exact same algorithm
        let dbHash = user.password;
        if (dbHash.startsWith('$2y$')) {
            dbHash = dbHash.replace(/^\$2y\$/, '$2a$');
        }

        const isMatch = await bcrypt.compare(password, dbHash);
        
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }

        // Obtener permisos
        const [permisosRows] = await pool.execute('SELECT modulo FROM usuario_permisos WHERE usuario_id = ? AND permitido = 1', [user.id]);
        const permisos = permisosRows.map(p => p.modulo);

        // Generate JWT
        const payload = {
            id: user.id,
            usuario: user.usuario,
            nombre: user.nombre,
            rol: user.rol,
            permisos: permisos
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

        // Log the login
        try {
            await pool.execute("INSERT INTO logs_sistema (usuario_id, accion, modulo, detalles, fecha) VALUES (?, 'LOGIN', 'SISTEMA', 'Inicio de sesión exitoso', NOW())", [user.id]);
        } catch(e) {
            console.error("Error logging login", e);
        }

        res.json({
            success: true,
            token,
            user: payload
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

module.exports = router;
