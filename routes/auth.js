const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const pool = require('../config/database');
const { log } = require('../utils/logger');

const GENERIC_LOGIN_FAILURE = { success: false, error: 'Credenciales inválidas.' };
const DUMMY_PASSWORD_HASH = '$2a$10$gp4V0L4mG/1A91ACT5aEde2z6UpWwE/iGLRZ0EYIiVHPK0RZC2Wx.';

function createLoginLimiter({ windowMs = 15 * 60 * 1000, limit = 5 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).json({
        success: false,
        error: 'Demasiados intentos de inicio de sesión. Inténtalo más tarde.'
      });
    }
  });
}

function createAuthRouter({
  database = pool,
  comparePassword = bcrypt.compare,
  signToken = jwt.sign,
  jwtSecret = process.env.JWT_SECRET,
  loginLimiter = createLoginLimiter()
} = {}) {
  const router = express.Router();

  router.post('/login', loginLimiter, async (req, res) => {
    const { usuario, password } = req.body || {};
    if (!usuario || !password) {
      return res.status(401).json(GENERIC_LOGIN_FAILURE);
    }

    try {
      const [rows] = await database.execute('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
      if (rows.length === 0 || rows[0].activo === 0) {
        await comparePassword(password, DUMMY_PASSWORD_HASH);
        return res.status(401).json(GENERIC_LOGIN_FAILURE);
      }

      const user = rows[0];
      const storedPassword = typeof user.password === 'string' ? user.password : DUMMY_PASSWORD_HASH;
      const dbHash = storedPassword.startsWith('$2y$')
        ? storedPassword.replace(/^\$2y\$/, '$2a$')
        : storedPassword;
      const isMatch = await comparePassword(password, dbHash);
      if (!isMatch) {
        return res.status(401).json(GENERIC_LOGIN_FAILURE);
      }

      const [permissionRows] = await database.execute(
        'SELECT modulo FROM usuario_permisos WHERE usuario_id = ? AND permitido = 1',
        [user.id]
      );
      const payload = {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
        rol: user.rol,
        permisos: permissionRows.map(({ modulo }) => modulo)
      };
      const token = signToken(payload, jwtSecret, { expiresIn: '12h' });

      try {
        await database.execute(
          "INSERT INTO logs_sistema (usuario_id, accion, modulo, detalles, fecha) VALUES (?, 'LOGIN', 'SISTEMA', 'Inicio de sesión exitoso', NOW())",
          [user.id]
        );
      } catch (error) {
        log('error', 'Failed to record login audit event', {
          requestId: req.requestId,
          error
        });
      }

      return res.json({ success: true, token, user: payload });
    } catch (error) {
      log('error', 'Unhandled login error', {
        requestId: req.requestId,
        error
      });
      return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  });

  return router;
}

const router = createAuthRouter();
module.exports = router;
module.exports.createAuthRouter = createAuthRouter;
module.exports.createLoginLimiter = createLoginLimiter;
