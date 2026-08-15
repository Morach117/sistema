import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import App from '../App'
import api from '../lib/api'
import Recepciones from '../pages/Recepciones'
import Reclamaciones from '../pages/Reclamaciones'
import ProtectedRoute from './ProtectedRoute'
import { clearSession, readSession, saveSession } from './session'

const originalApiAdapter = api.defaults.adapter

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="current location">{location.pathname}</output>
}

function employee(permisos) {
  return { id: 7, usuario: 'empleado', nombre: 'Empleado', rol: 'empleado', permisos }
}

function administrator() {
  return { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos: [] }
}

function renderAt(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Login</p>} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
        <Route path="/bodega" element={<p>Bodega</p>} />
        <Route path={path} element={element} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

function responseFor(config, data = {}) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: {},
  }
}

function appAdapter(config) {
  if (config.url === '/api/dashboard') {
    return Promise.resolve(responseFor(config, { kpis: {}, activity: [] }))
  }

  if (config.url === '/api/reclamaciones') {
    return Promise.resolve(responseFor(config, { data: [] }))
  }

  return Promise.resolve(responseFor(config))
}

function renderAppAt(path) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  api.defaults.adapter = appAdapter

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderPage(element, adapter) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  api.defaults.adapter = adapter

  return render(
    <QueryClientProvider client={queryClient}>
      {element}
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  clearSession()
  api.defaults.adapter = originalApiAdapter
  vi.restoreAllMocks()
})

describe('ProtectedRoute', () => {
  it('redirects a visitor without a valid session to login', () => {
    renderAt(
      '/recepciones',
      <ProtectedRoute module="recepciones"><p>Recepciones</p></ProtectedRoute>,
    )

    expect(screen.queryByText('Recepciones')).not.toBeInTheDocument()
    expect(screen.getByLabelText('current location')).toHaveTextContent('/login')
  })

  it('redirects an employee without usuarios permission', () => {
    saveSession({ token: 'signed-token', user: employee(['bodega']) })

    renderAt(
      '/usuarios',
      <ProtectedRoute module="usuarios"><p>Users</p></ProtectedRoute>,
    )

    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.getByLabelText('current location')).toHaveTextContent('/bodega')
  })

  it('renders the requested module for an employee with permission', () => {
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })

    renderAt(
      '/recepciones',
      <ProtectedRoute module="recepciones"><p>Recepciones</p></ProtectedRoute>,
    )

    expect(screen.getByText('Recepciones')).toBeInTheDocument()
  })

  it('allows an administrator to access every module', () => {
    saveSession({ token: 'signed-token', user: administrator() })

    renderAt(
      '/usuarios',
      <ProtectedRoute module="usuarios"><p>Users</p></ProtectedRoute>,
    )

    expect(screen.getByText('Users')).toBeInTheDocument()
  })

  it.each([
    '/admin-traspasos',
    '/auditoria',
    '/catalogo',
    '/evolucion-precios',
    '/usuarios',
  ])('guards the real %s application route', async (path) => {
    saveSession({ token: 'signed-token', user: employee(['dashboard']) })

    renderAppAt(path)

    await waitFor(() => {
      expect(screen.getByLabelText('current location')).toHaveTextContent('/dashboard')
    })
  })

  it('redirects a denied real route to the first permitted module without looping on dashboard', async () => {
    saveSession({ token: 'signed-token', user: employee(['bodega']) })

    renderAppAt('/usuarios')

    await waitFor(() => {
      expect(screen.getByLabelText('current location')).toHaveTextContent('/bodega')
    })
  })

  it('redirects a mounted protected route to login when a 401 clears its session', async () => {
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    renderAt(
      '/recepciones',
      <ProtectedRoute module="recepciones"><p>Recepciones</p></ProtectedRoute>,
    )
    api.defaults.adapter = (config) => Promise.reject({
      config,
      response: { status: 401 },
    })

    await expect(api.get('/api/recepciones')).rejects.toMatchObject({ response: { status: 401 } })

    await waitFor(() => {
      expect(screen.getByLabelText('current location')).toHaveTextContent('/login')
    })
  })
})

describe('session storage', () => {
  it('returns null instead of trusting malformed stored user data', () => {
    localStorage.setItem('token', 'signed-token')
    localStorage.setItem('user', '{not-json')

    expect(readSession()).toBeNull()
  })

  it('returns null for valid JSON with an incomplete user shape', () => {
    localStorage.setItem('token', 'signed-token')
    localStorage.setItem('user', JSON.stringify({ rol: 'admin' }))

    expect(readSession()).toBeNull()
  })

  it('returns null when browser storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError')
    })

    expect(readSession()).toBeNull()
  })

  it('clears in-memory subscribers without throwing when browser storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError')
    })

    expect(() => clearSession()).not.toThrow()
  })
})

describe('central API client', () => {
  it('adds the current bearer token to requests', async () => {
    saveSession({ token: 'signed-token', user: employee(['dashboard']) })
    let authorization
    api.defaults.adapter = async (config) => {
      authorization = config.headers.Authorization
      return responseFor(config)
    }

    await api.get('/api/dashboard')

    expect(authorization).toBe('Bearer signed-token')
  })

  it('clears the session after an unauthorized response', async () => {
    saveSession({ token: 'expired-token', user: administrator() })
    api.defaults.adapter = (config) => Promise.reject({
      config,
      response: { status: 401 },
    })

    await expect(api.get('/api/dashboard')).rejects.toMatchObject({ response: { status: 401 } })
    expect(readSession()).toBeNull()
  })
})

describe('authorized page behavior', () => {
  it('hides administrator-only reclamation actions from an employee', async () => {
    saveSession({ token: 'signed-token', user: employee(['reclamaciones']) })
    const adapter = (config) => {
      if (config.url === '/api/reclamaciones') {
        return Promise.resolve(responseFor(config, {
          data: [{ id: 2, numero_remision: 'REM-2', items_pendientes: 1, fecha_carga: '2026-08-14' }],
        }))
      }
      return Promise.resolve(responseFor(config, {
        items: [{
          id: 4,
          descripcion_original: 'Cuaderno',
          codigo_proveedor: 'C-1',
          existencia_lapiz: 2,
        }],
      }))
    }

    renderPage(<Reclamaciones />, adapter)
    fireEvent.click(await screen.findByText('# REM-2'))

    await screen.findByText('Cuaderno')
    expect(screen.queryByRole('button', { name: /terminar/i })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Aceptar Corrección')).not.toBeInTheDocument()
  })

  it('downloads a reception export through the authenticated API client', async () => {
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    let exportRequest = null
    const adapter = (config) => {
      if (config.url === '/api/recepciones' && config.method === 'get') {
        return Promise.resolve(responseFor(config, {
          data: [{
            id: 3,
            numero_remision: 'REM-3',
            estado: 'REVISION',
            fecha_carga: '2026-08-14',
            items: 1,
          }],
        }))
      }
      if (config.url === '/api/recepciones/3') {
        return Promise.resolve(responseFor(config, {
          datos: { 'REM-3': [] },
          estado: 'REVISION',
        }))
      }
      if (config.url === '/api/recepciones/generar_excel') {
        exportRequest = config
        return Promise.resolve({
          ...responseFor(config, new Blob(['export'])),
          headers: { 'content-disposition': 'attachment; filename="Carga_Sicar_REM-3.xls"' },
        })
      }
      return Promise.resolve(responseFor(config))
    }
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:export'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderPage(<Recepciones />, adapter)
    fireEvent.click(await screen.findByText('REM-3'))
    fireEvent.click(await screen.findByRole('button', { name: /excel/i }))

    await waitFor(() => expect(exportRequest).not.toBeNull())
    expect(exportRequest.headers.Authorization).toBe('Bearer signed-token')
    expect(JSON.parse(exportRequest.data)).toEqual({ remision_id: 'REM-3' })
    expect(exportRequest.responseType).toBe('blob')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })
})
