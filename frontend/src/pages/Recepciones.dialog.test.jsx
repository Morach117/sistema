import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import api from '@/lib/api'
import Recepciones from './Recepciones'

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Recepciones dialogs', () => {
  it('uses its controlled upload trigger and restores focus after Escape', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <Recepciones />
      </QueryClientProvider>,
    )

    const trigger = await screen.findByRole('button', { name: /subir xml/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: /cargar xml \/ csv/i })).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
