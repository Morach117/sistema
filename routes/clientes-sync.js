const express = require('express');
const os = require('node:os');
const auth = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { asyncHandler } = require('../middleware/errors');
const { createClientSyncService } = require('../services/client-sync-service');
const {
  createClientDiscoveryService,
  isAddressOnLocalSubnet,
} = require('../services/client-discovery-service');

function isLanSyncRequest(req) {
  const rawAddress = String(req.socket?.remoteAddress || '');
  const address = rawAddress.startsWith('::ffff:') ? rawAddress.slice(7) : rawAddress;
  if (address === '127.0.0.1' || address === '::1') return true;
  return isAddressOnLocalSubnet(address, os.networkInterfaces());
}

function requireLan(lanAccess) {
  return function lanBoundary(req, res, next) {
    if (lanAccess(req)) return next();
    return res.status(403).json({
      success: false,
      error: 'La sincronización solo está disponible desde la red LAN local.',
      requestId: req.requestId,
    });
  };
}

function createClientesSyncRouter({
  syncService = createClientSyncService(),
  discoveryService = createClientDiscoveryService(),
  lanAccess = isLanSyncRequest,
} = {}) {
  const router = express.Router();
  const lanBoundary = requireLan(lanAccess);

  router.put(
    '/configuracion',
    auth,
    authorize({ module: 'clientes-configuracion', action: 'write' }),
    lanBoundary,
    asyncHandler(async (req, res) => {
      const result = await syncService.configureNode({
        role: req.body?.rol_nodo,
        name: req.body?.nombre,
        requestId: req.requestId,
      });
      res.json({ success: true, data: result });
    })
  );

  router.get(
    '/estado',
    auth,
    authorize({ module: 'clientes', action: 'read' }),
    lanBoundary,
    asyncHandler(async (_req, res) => {
      const status = await syncService.getStatus();
      res.json({
        success: true,
        data: {
          sucursal: {
            nombre: status.sucursal?.nombre,
            rol: status.sucursal?.rol,
          },
          centralVinculada: Boolean(status.centralVinculada),
          centralFingerprint: status.centralFingerprint || null,
          estado: status.estado,
          pendientes: Number(status.pendientes || 0),
          conflictos: Number(status.conflictos || 0),
        },
      });
    })
  );

  router.post('/vincular', lanBoundary, asyncHandler(async (req, res) => {
    const response = await syncService.linkBranch({
      envelope: req.body,
      requestId: req.requestId,
    });
    res.status(201).json(response);
  }));

  router.post('/sincronizar', lanBoundary, asyncHandler(async (req, res) => {
    const response = await syncService.acceptSync({
      envelope: req.body,
      requestId: req.requestId,
    });
    res.json(response);
  }));

  router.post(
    '/codigo-vinculo',
    auth,
    authorize({ module: 'clientes-configuracion', action: 'write' }),
    asyncHandler(async (req, res) => {
      const result = await syncService.createPairingCode({ requestId: req.requestId });
      res.json({ success: true, data: result });
    })
  );

  router.post(
    '/emparejar',
    auth,
    authorize({ module: 'clientes-configuracion', action: 'write' }),
    asyncHandler(async (req, res) => {
      const result = await syncService.pairWithCentral({
        linkCode: req.body?.codigo_vinculo,
        branchName: req.body?.nombre_sucursal,
        requestId: req.requestId,
      });
      res.json({ success: true, data: result });
    })
  );

  router.post(
    '/descubrir',
    auth,
    authorize({ module: 'clientes-configuracion', action: 'write' }),
    asyncHandler(async (req, res) => {
      const endpoint = await discoveryService.discover({
        linkCode: req.body?.codigo_vinculo,
      });
      res.json({ success: true, data: endpoint });
    })
  );

  return router;
}

const router = createClientesSyncRouter();

module.exports = router;
module.exports.createClientesSyncRouter = createClientesSyncRouter;
module.exports.isLanSyncRequest = isLanSyncRequest;
