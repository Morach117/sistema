const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { errorHandler } = require('./middleware/errors');

function createApp({ corsOrigins = [] } = {}) {
  const app = express();
  const allowedOrigins = new Set(corsOrigins);

  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    }
  }));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const distPath = path.join(__dirname, 'frontend', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  } else {
    app.use(express.static(path.join(__dirname, '/')));
  }

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/catalogo', require('./routes/catalogo'));
  app.use('/api/bodega', require('./routes/bodega'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/usuarios', require('./routes/usuarios'));
  app.use('/api/traspasos', require('./routes/traspasos'));
  app.use('/api/recepciones', require('./routes/recepciones'));
  app.use('/api/captura', require('./routes/captura'));
  app.use('/api/reclamaciones', require('./routes/reclamaciones'));
  app.use('/api/evolucion-precios', require('./routes/evolucion'));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    if (fs.existsSync(distPath)) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
