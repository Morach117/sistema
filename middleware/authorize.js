const MODULES = Object.freeze([
  'dashboard',
  'bodega',
  'traspasos',
  'captura',
  'recepciones',
  'historial-recepciones',
  'reclamaciones',
  'catalogo',
  'evolucion-precios',
  'usuarios',
  'auditoria',
  'admin-traspasos'
]);

const moduleAllowlist = new Set(MODULES);
const actionAllowlist = new Set(['read', 'write']);

function denyAccess(res) {
  return res.status(403).json({ success: false, error: 'Acceso denegado.' });
}

function authorize({ module, action }) {
  if (!moduleAllowlist.has(module)) {
    throw new TypeError(`Módulo de autorización no permitido: ${module}`);
  }
  if (!actionAllowlist.has(action)) {
    throw new TypeError(`Acción de autorización no permitida: ${action}`);
  }

  return function authorizationMiddleware(req, res, next) {
    const user = req.user;
    if (user?.rol === 'admin' || (Array.isArray(user?.permisos) && user.permisos.includes(module))) {
      return next();
    }

    return denyAccess(res);
  };
}

module.exports = { MODULES, authorize, denyAccess, moduleAllowlist };
