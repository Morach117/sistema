import { Component, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './auth/ProtectedRoute'

const Login = lazyWithOneReload(() => import('./pages/Login'), 'login')
const Dashboard = lazyWithOneReload(() => import('./pages/Dashboard'), 'dashboard')
const Bodega = lazyWithOneReload(() => import('./pages/Bodega'), 'bodega')
function lazyWithOneReload(loader, moduleName) {
  return lazy(async () => {
    try {
      const module = await loader()
      window.sessionStorage.removeItem(`lazy-reload:${moduleName}`)
      return module
    } catch (error) {
      const retryKey = `lazy-reload:${moduleName}`
      if (!window.sessionStorage.getItem(retryKey)) {
        window.sessionStorage.setItem(retryKey, '1')
        window.location.reload()
        return new Promise(() => {})
      }
      window.sessionStorage.removeItem(retryKey)
      throw error
    }
  })
}

const Catalogo = lazyWithOneReload(() => import('./pages/Catalogo'), 'catalogo')
const Usuarios = lazyWithOneReload(() => import('./pages/Usuarios'), 'usuarios')
const Traspasos = lazyWithOneReload(() => import('./pages/Traspasos'), 'traspasos')
const AdminTraspasos = lazyWithOneReload(() => import('./pages/AdminTraspasos'), 'admin-traspasos')
const CapturaInteligente = lazyWithOneReload(() => import('./pages/CapturaInteligente'), 'captura')
const AuditoriaCaptura = lazyWithOneReload(() => import('./pages/AuditoriaCaptura'), 'auditoria')
const Recepciones = lazyWithOneReload(() => import('./pages/Recepciones'), 'recepciones')
const HistorialRecepciones = lazyWithOneReload(() => import('./pages/HistorialRecepciones'), 'historial-recepciones')
const Reclamaciones = lazyWithOneReload(() => import('./pages/Reclamaciones'), 'reclamaciones')
const EvolucionPrecios = lazyWithOneReload(() => import('./pages/EvolucionPrecios'), 'evolucion-precios')
const Clientes = lazyWithOneReload(() => import('./pages/Clientes'), 'clientes')
const ClientesConfiguracion = lazyWithOneReload(() => import('./pages/ClientesConfiguracion'), 'clientes-configuracion')

function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-label="Cargando módulo"
      aria-live="polite"
      className="flex min-h-40 items-center justify-center text-sm font-bold text-muted-foreground"
    >
      Cargando módulo…
    </div>
  )
}

function LazyPage({ children }) {
  return <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>
}

class RouteErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-foreground">
        <h1 className="text-lg font-black">No se pudo abrir este módulo</h1>
        <p className="mt-2 text-sm text-muted-foreground">La aplicación sigue disponible. Intenta cargar el módulo de nuevo.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          Cargar de nuevo
        </button>
      </div>
    )
  }
}

function ProtectedModule({ module, children }) {
  return (
    <ProtectedRoute module={module}>
      <RouteErrorBoundary><LazyPage>{children}</LazyPage></RouteErrorBoundary>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedModule module="dashboard"><Dashboard /></ProtectedModule>} />
        <Route path="bodega" element={<ProtectedModule module="bodega"><Bodega /></ProtectedModule>} />
        <Route path="traspasos" element={<ProtectedModule module="traspasos"><Traspasos /></ProtectedModule>} />
        <Route path="admin-traspasos" element={<ProtectedModule module="admin-traspasos"><AdminTraspasos /></ProtectedModule>} />
        <Route path="captura" element={<ProtectedModule module="captura"><CapturaInteligente /></ProtectedModule>} />
        <Route path="auditoria" element={<ProtectedModule module="auditoria"><AuditoriaCaptura /></ProtectedModule>} />
        <Route path="recepciones" element={<ProtectedModule module="recepciones"><Recepciones /></ProtectedModule>} />
        <Route path="historial-recepciones" element={<ProtectedModule module="historial-recepciones"><HistorialRecepciones /></ProtectedModule>} />
        <Route path="reclamaciones" element={<ProtectedModule module="reclamaciones"><Reclamaciones /></ProtectedModule>} />
        <Route path="evolucion-precios" element={<ProtectedModule module="evolucion-precios"><EvolucionPrecios /></ProtectedModule>} />
        <Route path="catalogo" element={<ProtectedModule module="catalogo"><Catalogo /></ProtectedModule>} />
        <Route path="usuarios" element={<ProtectedModule module="usuarios"><Usuarios /></ProtectedModule>} />
        <Route path="clientes" element={<ProtectedModule module="clientes"><Clientes /></ProtectedModule>} />
        <Route path="clientes-configuracion" element={<ProtectedModule module="clientes-configuracion"><ClientesConfiguracion /></ProtectedModule>} />
      </Route>
    </Routes>
  )
}

export default App
