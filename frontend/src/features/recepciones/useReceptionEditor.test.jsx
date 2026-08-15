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

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return function Wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
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
    )
  })

  it('persists a confirmed field when the selected reception changes before debounce ends', async () => {
    const { result, rerender } = renderHook(
      ({ remisionId }) => useReceptionEditor(remisionId),
      { initialProps: { remisionId: 19 }, wrapper: createWrapper() },
    )

    act(() => {
      result.current.setDraftField(7, 'clave_final', 'A-2')
      result.current.saveField(7, 'clave_final', 'A-2')
      vi.advanceTimersByTime(100)
    })

    rerender({ remisionId: 20 })
    await act(async () => vi.advanceTimersByTimeAsync(150))

    expect(api.post).toHaveBeenCalledWith(
      '/api/recepciones/actualizar_campo',
      { id_item: 7, campo: 'clave_final', valor: 'A-2' },
    )
  })

  it('serializes confirmed values for one field until the prior request settles', async () => {
    const firstRequest = deferred()
    api.post
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce({ data: { ok: true } })
    const { result } = renderHook(() => useReceptionEditor(19), { wrapper: createWrapper() })

    act(() => result.current.saveField(7, 'clave_final', 'A-2'))
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(api.post).toHaveBeenCalledTimes(1)

    act(() => result.current.saveField(7, 'clave_final', 'A-3'))
    await act(async () => vi.advanceTimersByTimeAsync(250))

    expect(api.post).toHaveBeenCalledTimes(1)

    await act(async () => {
      firstRequest.resolve({ data: { ok: true } })
      await firstRequest.promise
    })
    await act(async () => vi.runAllTimersAsync())

    expect(api.post).toHaveBeenCalledTimes(2)
    expect(api.post).toHaveBeenLastCalledWith(
      '/api/recepciones/actualizar_campo',
      { id_item: 7, campo: 'clave_final', valor: 'A-3' },
    )
  })

  it('flushes a debounced save immediately and waits for its request to settle', async () => {
    const request = deferred()
    api.post.mockImplementationOnce(() => request.promise)
    const { result } = renderHook(() => useReceptionEditor(19), { wrapper: createWrapper() })

    act(() => result.current.saveField(7, 'clave_final', 'A-2'))

    expect(result.current.hasPending).toBe(true)
    expect(api.post).not.toHaveBeenCalled()

    let flushPromise
    await act(async () => {
      flushPromise = result.current.flushAndWait()
      await Promise.resolve()
    })

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(result.current.hasPending).toBe(true)

    await act(async () => {
      request.resolve({ data: { ok: true } })
      await flushPromise
    })

    expect(result.current.hasPending).toBe(false)
  })

  it('rejects a flush when a reception field could not be persisted', async () => {
    const saveError = new Error('No se pudo guardar')
    api.post.mockRejectedValueOnce(saveError)
    const { result } = renderHook(() => useReceptionEditor(19), { wrapper: createWrapper() })

    act(() => result.current.saveField(7, 'cantidad', '12'))

    let flushPromise
    let rejectedFlush
    await act(async () => {
      flushPromise = result.current.flushAndWait()
      rejectedFlush = expect(flushPromise).rejects.toBe(saveError)
      await Promise.resolve()
    })

    await act(async () => {
      await rejectedFlush
    })
    expect(result.current.hasPending).toBe(false)
  })

  it('does not carry a failed field from one reception into actions on another reception', async () => {
    const saveError = new Error('No se pudo guardar REM-19')
    api.post.mockRejectedValueOnce(saveError)
    const { result, rerender } = renderHook(
      ({ remisionId }) => useReceptionEditor(remisionId),
      { initialProps: { remisionId: 19 }, wrapper: createWrapper() },
    )

    act(() => result.current.saveField(7, 'cantidad', '12'))
    let failedReceptionFlush
    await act(async () => {
      failedReceptionFlush = expect(result.current.flushAndWait()).rejects.toBe(saveError)
      await failedReceptionFlush
    })

    rerender({ remisionId: 20 })

    await act(async () => {
      await expect(result.current.flushAndWait()).resolves.toBeUndefined()
    })
  })
})
