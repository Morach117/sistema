export function canAccess(user, module) {
  if (!user || !module) return false
  if (user.rol === 'admin') return true
  return Array.isArray(user.permisos) && user.permisos.includes(module)
}

const ROUTABLE_MODULES = new Set([
  'dashboard',
  'bodega',
  'traspasos',
  'captura',
  'recepciones',
  'reclamaciones',
  'catalogo',
  'evolucion-precios',
  'usuarios',
  'auditoria',
  'admin-traspasos',
])

export function defaultPathFor(user) {
  if (user?.rol === 'admin') return '/dashboard'
  const firstPermission = user?.permisos?.find((module) => ROUTABLE_MODULES.has(module))
  return firstPermission ? `/${firstPermission}` : '/login'
}
