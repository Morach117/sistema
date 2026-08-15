import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './auth/ProtectedRoute'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Bodega = lazy(() => import('./pages/Bodega'))
const Catalogo = lazy(() => import('./pages/Catalogo'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Traspasos = lazy(() => import('./pages/Traspasos'))
const AdminTraspasos = lazy(() => import('./pages/AdminTraspasos'))
const CapturaInteligente = lazy(() => import('./pages/CapturaInteligente'))
const AuditoriaCaptura = lazy(() => import('./pages/AuditoriaCaptura'))
const Recepciones = lazy(() => import('./pages/Recepciones'))
const HistorialRecepciones = lazy(() => import('./pages/HistorialRecepciones'))
const Reclamaciones = lazy(() => import('./pages/Reclamaciones'))
const EvolucionPrecios = lazy(() => import('./pages/EvolucionPrecios'))

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

function ProtectedModule({ module, children }) {
  return (
    <ProtectedRoute module={module}>
      <LazyPage>{children}</LazyPage>
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
      </Route>
    </Routes>
  )
}

export default App
