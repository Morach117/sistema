const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { errorHandler } = require('./middleware/errors');
const { requestContext } = require('./middleware/request-context');
const { log } = require('./utils/logger');

async function defaultReadinessCheck() {
  await require('./config/database').query('SELECT 1');
}

function createApp({
  corsOrigins = [],
  environment = process.env.NODE_ENV || 'development',
  frontendDistPath = path.join(__dirname, 'frontend', 'dist'),
  developmentPublicPath,
  readinessCheck = defaultReadinessCheck,
} = {}) {
  const app = express();
  const allowedOrigins = new Set(corsOrigins);

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    }
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/health', async (req, res) => {
    try {
      await readinessCheck();
      return res.json({ status: 'ready' });
    } catch (error) {
      log('error', 'Readiness check failed', { requestId: req.requestId, error });
      return res.status(503).json({ status: 'unavailable', requestId: req.requestId });
    }
  });

  const distPath = path.resolve(frontendDistPath);
  const hasFrontendBuild = fs.existsSync(path.join(distPath, 'index.html'));
  if (!hasFrontendBuild && environment === 'production') {
    throw new Error(`No se encontro el build frontend requerido en ${distPath}.`);
  }
  const safeStaticPath = hasFrontendBuild
    ? distPath
    : developmentPublicPath && path.resolve(developmentPublicPath);
  if (safeStaticPath) app.use(express.static(safeStaticPath));

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
    if (path.extname(req.path)) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (safeStaticPath && fs.existsSync(path.join(safeStaticPath, 'index.html'))) {
      return res.sendFile(path.join(safeStaticPath, 'index.html'));
    }
    return res.status(404).json({ error: 'Frontend not available' });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
