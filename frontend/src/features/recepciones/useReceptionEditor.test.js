import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '@/lib/api'
import { useReceptionEditor } from './useReceptionEditor'

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return function Wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  api.post.mockResolvedValue({ data: { ok: true } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useReceptionEditor', () => {
  it('saves a reception field only after explicit confirmation', async () => {
    const { result } = renderHook(() => useReceptionEditor(19), { wrapper: createWrapper() })

    act(() => result.current.setDraftField(7, 'clave_final', 'A-2'))

    expect(result.current.getDraftField(7, 'clave_final', '')).toBe('A-2')
    expect(api.post).not.toHaveBeenCalled()

    act(() => result.current.saveField(7, 'clave_final'))
    expect(api.post).not.toHaveBeenCalled()

    await act(async () => vi.runAllTimersAsync())

    expect(api.post).toHaveBeenCalledWith(
      '/api/recepciones/actualizar_campo',
      { id_item: 7, campo: 'clave_final', valor: 'A-2' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('cancels a pending save when a newer value is confirmed', async () => {
    const { result } = renderHook(() => useReceptionEditor(19), { wrapper: createWrapper() })

    act(() => {
      result.current.setDraftField(7, 'clave_final', 'A-2')
      result.current.saveField(7, 'clave_final', 'A-2')
      result.current.setDraftField(7, 'clave_final', 'A-3')
      result.current.saveField(7, 'clave_final', 'A-3')
    })

    await act(async () => vi.runAllTimersAsync())

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith(
      '/api/recepciones/actualizar_campo',
      { id_item: 7, campo: 'clave_final', valor: 'A-3' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
