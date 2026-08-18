import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import api from '@/lib/api'
import { clearSession, saveSession } from '@/auth/session'
import ClientesConfiguracion from './ClientesConfiguracion'

const originalAdapter = api.defaults.adapter

function renderPage(adapter) {
  saveSession({
    token: 'signed-token',
    user: { id: 1, usuario: 'admin', nombre: 'Admin local', rol: 'admin', permisos: ['clientes'] },
  })
  api.defaults.adapter = adapter
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ClientesConfiguracion /></MemoryRouter>
    </QueryClientProvider>,
  )
}

function statusAdapter(status) {
  return async (config) => ({
    data: { success: true, data: status },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: {},
  })
}

function configuredAdapter(requests) {
  return async (config) => {
    requests.push(config)
    return {
      data: { success: true, data: { configuracionRequerida: false, sucursal: { nombre: 'Sucursal Centro', rol: 'central' }, centralVinculada: true, pendientes: 0, conflictos: 0 } },
      status: 200, statusText: 'OK', headers: {}, config, request: {},
    }
  }
}

function statusErrorAdapter(status) {
  return async () => {
    const error = new Error('Servicio local no disponible')
    error.response = { status, data: { error: error.message } }
    throw error
  }
}

afterEach(() => {
  cleanup()
  clearSession()
  api.defaults.adapter = originalAdapter
})

describe('ClientesConfiguracion first use', () => {
  it('lets the operator select one of multiple detected Centrales without authorizing before a code', async () => {
    const requests = []
    const status = {
      configuracionRequerida: false,
      sucursal: { nombre: 'Sucursal Centro', rol: 'sucursal' },
      centralVinculada: false,
      pendientes: 0,
      conflictos: 0,
      centralesDetectadas: [{
        name: 'Central Matriz',
        fingerprint: 'central-matriz-fingerprint',
        seenAt: '2026-08-18T12:00:00.000Z',
        address: '192.168.1.20',
        hostname: 'matriz-host',
        centralPublicKey: 'must-not-leak',
      }, {
        name: 'Central Norte',
        fingerprint: 'central-norte-fingerprint',
        seenAt: '2026-08-18T12:00:01.000Z',
      }],
    }
    renderPage(async (config) => {
      requests.push(config)
      return statusAdapter(status)(config)
    })

    const matriz = await screen.findByRole('radio', { name: /Central Matriz.*pendiente de autorización/i })
    const norte = screen.getByRole('radio', { name: /Central Norte.*pendiente de autorización/i })
    expect(matriz).not.toBeChecked()
    expect(norte).not.toBeChecked()
    fireEvent.click(norte)

    expect(matriz).not.toBeChecked()
    expect(norte).toBeChecked()
    expect(screen.getByText(/1\. selecciona una central detectada/i)).toBeVisible()
    expect(screen.getByText(/2\. pega el código temporal/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /validar código/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /vincular sucursal/i })).not.toBeInTheDocument()
    expect(requests.filter((request) => request.method !== 'get')).toHaveLength(0)
    expect(screen.queryByText(/192\.168\.1\.20|matriz-host|must-not-leak/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: /código de vínculo/i }), {
      target: { value: 'signed-link-code' },
    })
    fireEvent.click(screen.getByRole('button', { name: /validar código/i }))
    await waitFor(() => {
      const discoveryRequest = requests.find((request) => request.url === '/api/clientes-sync/descubrir')
      expect(JSON.parse(discoveryRequest.data)).toEqual({
        codigo_vinculo: 'signed-link-code',
        central_fingerprint: 'central-norte-fingerprint',
      })
    })

    fireEvent.click(await screen.findByRole('button', { name: /vincular sucursal/i }))
    await waitFor(() => {
      const pairingRequest = requests.find((request) => request.url === '/api/clientes-sync/emparejar')
      expect(JSON.parse(pairingRequest.data)).toEqual({
        codigo_vinculo: 'signed-link-code',
        nombre_sucursal: 'Sucursal Centro',
        central_fingerprint: 'central-norte-fingerprint',
      })
    })
  })

  it('explains the complete no-candidate requirements and refreshes candidates without requesting authorization', async () => {
    const requests = []
    const status = {
      configuracionRequerida: false,
      sucursal: { nombre: 'Sucursal Centro', rol: 'sucursal' },
      centralVinculada: false,
      pendientes: 0,
      conflictos: 0,
      centralesDetectadas: [],
    }
    renderPage(async (config) => {
      requests.push(config)
      return statusAdapter(status)(config)
    })

    const emptyMessage = await screen.findByText(/ambas instalaciones deben tener el sistema iniciado/i)
    expect(emptyMessage).toHaveTextContent(/identidad.*configurada/i)
    expect(emptyMessage).toHaveTextContent(/Central o Sucursal/i)
    fireEvent.click(screen.getByRole('button', { name: /volver a buscar/i }))

    await waitFor(() => expect(requests.filter((request) => request.method === 'get')).toHaveLength(2))
    expect(requests.some((request) => request.url === '/api/clientes-sync/descubrir')).toBe(false)
    expect(requests.some((request) => request.url === '/api/clientes-sync/emparejar')).toBe(false)
  })

  it('keeps the submitted Central and code immutable while signed validation is pending', async () => {
    let releaseDiscovery
    const pendingDiscovery = new Promise((resolve) => { releaseDiscovery = resolve })
    const status = {
      configuracionRequerida: false,
      sucursal: { nombre: 'Sucursal Centro', rol: 'sucursal' },
      centralVinculada: false,
      pendientes: 0,
      conflictos: 0,
      centralesDetectadas: [{
        name: 'Central Matriz',
        fingerprint: 'central-matriz-fingerprint',
        seenAt: '2026-08-18T12:00:00.000Z',
      }, {
        name: 'Central Norte',
        fingerprint: 'central-norte-fingerprint',
        seenAt: '2026-08-18T12:00:01.000Z',
      }],
    }
    renderPage(async (config) => {
      if (config.url === '/api/clientes-sync/descubrir') return pendingDiscovery
      return statusAdapter(status)(config)
    })

    const matriz = await screen.findByRole('radio', { name: /Central Matriz.*pendiente de autorización/i })
    const norte = screen.getByRole('radio', { name: /Central Norte.*pendiente de autorización/i })
    const code = screen.getByRole('textbox', { name: /código de vínculo/i })
    fireEvent.click(matriz)
    fireEvent.change(code, { target: { value: 'signed-link-code' } })
    fireEvent.click(screen.getByRole('button', { name: /validar código/i }))

    await waitFor(() => {
      expect(matriz).toBeDisabled()
      expect(norte).toBeDisabled()
      expect(code).toBeDisabled()
    })
    releaseDiscovery(statusAdapter(status)({ url: '/api/clientes-sync/descubrir', method: 'post' }))
  })

  it('shows a first-use Central or Sucursal choice when setup is required', async () => {
    renderPage(statusAdapter({ configuracionRequerida: true, sucursal: null }))

    fireEvent.click(await screen.findByRole('button', { name: /esta será la central/i }))

    expect(screen.getByLabelText(/nombre visible/i)).toBeVisible()
  })

  it('shows a retryable service message instead of a stuck role field', async () => {
    renderPage(statusErrorAdapter(404))

    expect(await screen.findByRole('alert')).toHaveTextContent(/servicio local/i)
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /^esta instalación$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buscar central/i })).not.toBeInTheDocument()
  })

  it('saves a renamed configured installation with its fixed current role', async () => {
    const requests = []
    renderPage(configuredAdapter(requests))

    await screen.findByText(/valores detectados en el servidor local/i)
    const name = screen.getByLabelText(/nombre visible/i)
    fireEvent.change(name, { target: { value: 'Central principal' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar nombre/i }))

    await waitFor(() => {
      const update = requests.find((request) => request.url === '/api/clientes-sync/configuracion' && request.method === 'put')
      expect(JSON.parse(update.data)).toEqual({ rol_nodo: 'central', nombre: 'Central principal' })
    })
  })
})
