export function canAccess(user, module) {
  if (!user || !module) return false
  if (user.rol === 'admin') return true
  return Array.isArray(user.permisos) && user.permisos.includes(module)
}

export const EMPLOYEE_PERMISSION_OPTIONS = Object.freeze([
  { module: 'dashboard', label: 'Dashboard' },
  { module: 'bodega', label: 'Bodega' },
  { module: 'traspasos', label: 'Traspasos' },
  { module: 'captura', label: 'Captura' },
  { module: 'recepciones', label: 'Recepciones' },
  { module: 'historial-recepciones', label: 'Historial Recepciones' },
  { module: 'reclamaciones', label: 'Reclamaciones' },
])

const ROUTABLE_MODULES = new Set([
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
  'admin-traspasos',
])

export function defaultPathFor(user) {
  if (user?.rol === 'admin') return '/dashboard'
  const firstPermission = user?.permisos?.find((module) => ROUTABLE_MODULES.has(module))
  return firstPermission ? `/${firstPermission}` : '/login'
}
