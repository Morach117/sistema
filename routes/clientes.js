const express = require('express');
const auth = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { asyncHandler } = require('../middleware/errors');
const { createClientesService } = require('../services/clientes-service');

function createClientesRouter({ clientesService = createClientesService() } = {}) {
  const router = express.Router();

  router.use(auth);
  router.use(authorize({ module: 'clientes', action: 'read' }));

  router.get('/', asyncHandler(async (req, res) => {
    const result = await clientesService.listClientes({
      pagina: req.query.pagina,
      limite: req.query.limite,
      buscar: req.query.buscar,
      activo: req.query.activo
    });
    res.json({ success: true, ...result });
  }));

  router.post('/', authorize({ module: 'clientes', action: 'write' }), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await clientesService.createCliente({
      nombre: body.nombre,
      telefono: body.telefono,
      correo: body.correo,
      notas: body.notas,
      actorId: req.user.id,
      requestId: req.requestId
    });
    res.status(201).json({ success: true, data: result });
  }));

  router.get('/:id/compras', asyncHandler(async (req, res) => {
    const result = await clientesService.listPurchases({
      clienteId: req.params.id,
      pagina: req.query.pagina,
      limite: req.query.limite
    });
    res.json({ success: true, ...result });
  }));

  router.post('/:id/compras', authorize({ module: 'clientes', action: 'write' }), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await clientesService.registerPurchase({
      clienteId: req.params.id,
      folio_ticket: body.folio_ticket,
      total: body.total,
      detalle: body.detalle,
      fecha_compra: body.fecha_compra,
      actorId: req.user.id,
      requestId: req.requestId
    });
    res.status(201).json({ success: true, data: result });
  }));

  router.post('/:id/desactivar', authorize({ module: 'clientes', action: 'write' }), asyncHandler(async (req, res) => {
    const result = await clientesService.deactivateCliente({
      clienteId: req.params.id,
      actorId: req.user.id,
      requestId: req.requestId
    });
    res.json({ success: true, data: result });
  }));

  router.put('/:id', authorize({ module: 'clientes', action: 'write' }), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await clientesService.updateCliente({
      clienteId: req.params.id,
      nombre: body.nombre,
      telefono: body.telefono,
      correo: body.correo,
      notas: body.notas,
      actorId: req.user.id,
      requestId: req.requestId
    });
    res.json({ success: true, data: result });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const result = await clientesService.getCliente({ clienteId: req.params.id });
    res.json({ success: true, data: result });
  }));

  return router;
}

const router = createClientesRouter();

module.exports = router;
module.exports.createClientesRouter = createClientesRouter;
