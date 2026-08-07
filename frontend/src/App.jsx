import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import axios from 'axios'
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

// Setup Axios Interceptor
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

function ProtectedRoute({ children, module }) {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  
  if (module) {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (user?.rol !== 'admin') {
        if (!user?.permisos || !user.permisos.includes(module)) {
          return <Navigate to="/dashboard" replace />
        }
      }
    } catch(e) {}
  }

  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />
        <Route path="bodega" element={<ProtectedRoute module="bodega"><Bodega /></ProtectedRoute>} />
        <Route path="traspasos" element={<ProtectedRoute module="traspasos"><Traspasos /></ProtectedRoute>} />
        <Route path="admin-traspasos" element={<AdminTraspasos />} />
        <Route path="captura" element={<ProtectedRoute module="captura"><CapturaInteligente /></ProtectedRoute>} />
        <Route path="auditoria" element={<AuditoriaCaptura />} />
        <Route path="recepciones" element={<ProtectedRoute module="recepciones"><Recepciones /></ProtectedRoute>} />
        <Route path="reclamaciones" element={<ProtectedRoute module="reclamaciones"><Reclamaciones /></ProtectedRoute>} />
        <Route path="evolucion-precios" element={<EvolucionPrecios />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="usuarios" element={<Usuarios />} />
      </Route>
    </Routes>
  )
}

export default App
