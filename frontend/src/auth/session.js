const TOKEN_KEY = 'token'
const USER_KEY = 'user'
const sessionListeners = new Set()

function isValidUser(user) {
  return user
    && typeof user === 'object'
    && !Array.isArray(user)
    && (typeof user.id === 'number' || typeof user.id === 'string')
    && typeof user.usuario === 'string'
    && typeof user.nombre === 'string'
    && user.nombre.trim() !== ''
    && (user.rol === 'admin' || user.rol === 'empleado')
    && Array.isArray(user.permisos)
    && user.permisos.every((permission) => typeof permission === 'string')
}

function notifySessionChanged() {
  for (const listener of sessionListeners) listener()
}

export function readSession() {
  if (typeof localStorage === 'undefined') return null

  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)
    if (!token?.trim() || !storedUser) return null
    const user = JSON.parse(storedUser)
    if (!isValidUser(user)) return null
    return { token, user }
  } catch {
    return null
  }
}

export function saveSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  notifySessionChanged()
}

export function clearSession() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  } finally {
    notifySessionChanged()
  }
}

export function subscribeSession(listener) {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}
