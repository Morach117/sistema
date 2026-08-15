import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Bodega from './pages/Bodega'
import Catalogo from './pages/Catalogo'
import Usuarios from './pages/Usuarios'
import Traspasos from './pages/Traspasos'
import AdminTraspasos from './pages/AdminTraspasos'
import CapturaInteligente from './pages/CapturaInteligente'
import AuditoriaCaptura from './pages/AuditoriaCaptura'
import Recepciones from './pages/Recepciones'
import Reclamaciones from './pages/Reclamaciones'
import EvolucionPrecios from './pages/EvolucionPrecios'
import Layout from './components/Layout'
import ProtectedRoute from './auth/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />
        <Route path="bodega" element={<ProtectedRoute module="bodega"><Bodega /></ProtectedRoute>} />
        <Route path="traspasos" element={<ProtectedRoute module="traspasos"><Traspasos /></ProtectedRoute>} />
        <Route path="admin-traspasos" element={<ProtectedRoute module="admin-traspasos"><AdminTraspasos /></ProtectedRoute>} />
        <Route path="captura" element={<ProtectedRoute module="captura"><CapturaInteligente /></ProtectedRoute>} />
        <Route path="auditoria" element={<ProtectedRoute module="auditoria"><AuditoriaCaptura /></ProtectedRoute>} />
        <Route path="recepciones" element={<ProtectedRoute module="recepciones"><Recepciones /></ProtectedRoute>} />
        <Route path="reclamaciones" element={<ProtectedRoute module="reclamaciones"><Reclamaciones /></ProtectedRoute>} />
        <Route path="evolucion-precios" element={<ProtectedRoute module="evolucion-precios"><EvolucionPrecios /></ProtectedRoute>} />
        <Route path="catalogo" element={<ProtectedRoute module="catalogo"><Catalogo /></ProtectedRoute>} />
        <Route path="usuarios" element={<ProtectedRoute module="usuarios"><Usuarios /></ProtectedRoute>} />
      </Route>
    </Routes>
  )
}

export default App
