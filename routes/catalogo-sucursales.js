const express = require('express');
const os = require('node:os');
const auth = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { asyncHandler } = require('../middleware/errors');
const { canManageReception } = require('../services/reception-access-policy');
const { createBranchCatalogService } = require('../services/branch-catalog-service');
const { isTailscaleAddress } = require('../services/client-sync-service');
const { isAddressOnLocalSubnet } = require('../services/client-discovery-service');

function isLanRequest(req) {
  const raw = String(req.socket?.remoteAddress || '');
  const address = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return address === '127.0.0.1' || address === '::1'
    || isTailscaleAddress(address)
    || isAddressOnLocalSubnet(address, os.networkInterfaces());
}

function requireLan(req, res, next) {
  if (isLanRequest(req)) return next();
  return res.status(403).json({ success: false, error: 'La consulta entre sucursales solo está disponible en la red privada.' });
}

function createBranchCatalogRouter({ service = createBranchCatalogService() } = {}) {
  const router = express.Router();

  router.get('/recepcion', auth, authorize({ module: 'recepciones', action: 'read' }), asyncHandler(async (req, res) => {
    const result = await service.resolveForReception({
      code: req.query?.code,
      includePrices: canManageReception(req.user),
    });
    res.json({ success: true, data: result });
  }));

  router.get('/anuncio-remoto', requireLan, asyncHandler(async (_req, res) => {
    res.json(await service.announceBranch());
  }));

  router.post('/consulta-central-remota', requireLan, asyncHandler(async (req, res) => {
    res.json(await service.receiveCentralLookup({ envelope: req.body }));
  }));

  router.post('/consulta-sucursal-remota', requireLan, asyncHandler(async (req, res) => {
    res.json(await service.receiveBranchLookup({ envelope: req.body }));
  }));

  return router;
}

module.exports = { createBranchCatalogRouter, isLanRequest };
