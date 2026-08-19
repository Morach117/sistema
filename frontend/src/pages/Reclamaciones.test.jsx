import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { clearSession, saveSession } from '@/auth/session'
import api from '@/lib/api'
import Reclamaciones from './Reclamaciones'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

afterEach(() => {
  cleanup()
  clearSession()
  vi.clearAllMocks()
})

it('calls the incident workspace rectification and recount instead of rejected products', async () => {
  saveSession({
    token: 'signed-token',
    user: { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos: ['reclamaciones'] },
  })
  api.get.mockResolvedValue({ data: { data: [] } })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <Reclamaciones />
    </QueryClientProvider>,
  )

  expect(screen.getByRole('heading', { name: /rectificación y re-conteo/i })).toBeVisible()
  expect(screen.getByText(/artículos por rectificar/i)).toBeVisible()
  expect(screen.queryByText(/productos rechazados/i)).not.toBeInTheDocument()
})
