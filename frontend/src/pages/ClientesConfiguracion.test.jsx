import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('shows a first-use Central or Sucursal choice when setup is required', async () => {
    renderPage(statusAdapter({ configuracionRequerida: true, sucursal: null }))

    fireEvent.click(await screen.findByRole('button', { name: /esta será la central/i }))

    expect(screen.getByLabelText(/nombre visible/i)).toBeVisible()
  })

  it('shows a retryable service message instead of a stuck role field', async () => {
    renderPage(statusErrorAdapter(404))

    expect(await screen.findByRole('alert')).toHaveTextContent(/servicio local/i)
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeVisible()
  })
})
