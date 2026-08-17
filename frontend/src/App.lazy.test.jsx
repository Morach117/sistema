import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import api from './lib/api'
import { clearSession, saveSession } from './auth/session'

const originalApiAdapter = api.defaults.adapter

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

function renderAt(path) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  api.defaults.adapter = (config) => Promise.resolve(responseFor(config, { data: [] }))

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  clearSession()
  api.defaults.adapter = originalApiAdapter
})

it('shows an accessible loading status while a lazy route resolves', async () => {
  saveSession({
    token: 'signed-token',
    user: { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos: [] },
  })

  renderAt('/auditoria')

  expect(screen.getByRole('status', { name: /cargando módulo/i })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: /auditoría de captura/i }, { timeout: 5_000 })).toBeInTheDocument()
})

it.each([
  ['/clientes', /clientes/i],
  ['/clientes-configuracion', /configuración de clientes/i],
])('mounts the lazy %s module for an administrator', async (path, heading) => {
  saveSession({
    token: 'signed-token',
    user: { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos: [] },
  })

  renderAt(path)

  expect(await screen.findByRole('heading', { name: heading }, { timeout: 5_000 })).toBeInTheDocument()
})
