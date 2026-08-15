import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Swal from 'sweetalert2'
import api from '@/lib/api'

const SAVE_DELAY_MS = 250
const fieldKey = (itemId, field) => `${itemId}:${field}`

export function useReceptionEditor(remisionId) {
  const queryClient = useQueryClient()
  const [draftFields, setDraftFields] = useState({})
  const [hasPending, setHasPending] = useState(false)
  const timersRef = useRef(new Map())
  const pendingSavesRef = useRef(new Map())
  const requestChainsRef = useRef(new Map())
  const saveErrorsRef = useRef(new Map())
  const mutationRef = useRef(null)

  const mutation = useMutation({
    mutationFn: ({ id_item, campo, valor }) => api.post(
      '/api/recepciones/actualizar_campo',
      { id_item, campo, valor },
    ),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({
      queryKey: ['recepciones_detail', variables.remisionId],
    }),
    onError: (error) => {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: error.response?.data?.error || 'Error',
        showConfirmButton: false,
        timer: 1500,
      })
    },
  })
  mutationRef.current = mutation

  useEffect(() => {
    setDraftFields({})
  }, [remisionId])

  const setDraftField = useCallback((itemId, field, value) => {
    setDraftFields((current) => ({ ...current, [fieldKey(itemId, field)]: value }))
  }, [])

  const getDraftField = useCallback((itemId, field, fallback = '') => {
    const key = fieldKey(itemId, field)
    return Object.prototype.hasOwnProperty.call(draftFields, key) ? draftFields[key] : fallback
  }, [draftFields])

  const refreshPendingState = useCallback(() => {
    setHasPending(
      pendingSavesRef.current.size > 0 || requestChainsRef.current.size > 0,
    )
  }, [])

  const startPendingSave = useCallback((key) => {
    const variables = pendingSavesRef.current.get(key)
    if (!variables) return requestChainsRef.current.get(key)

    clearTimeout(timersRef.current.get(key))
    timersRef.current.delete(key)
    pendingSavesRef.current.delete(key)

    const previousRequest = requestChainsRef.current.get(key) || Promise.resolve()
    const nextRequest = previousRequest
      .catch(() => undefined)
      .then(() => mutationRef.current.mutateAsync(variables))

    requestChainsRef.current.set(key, nextRequest)
    refreshPendingState()

    nextRequest.then(
      () => saveErrorsRef.current.delete(key),
      (error) => saveErrorsRef.current.set(key, error),
    )

    const clearSettledRequest = () => {
      if (requestChainsRef.current.get(key) === nextRequest) {
        requestChainsRef.current.delete(key)
      }
      refreshPendingState()
    }
    nextRequest.then(clearSettledRequest, clearSettledRequest)
    return nextRequest
  }, [refreshPendingState])

  const saveField = useCallback((itemId, field, explicitValue) => {
    const key = fieldKey(itemId, field)
    const value = explicitValue ?? draftFields[key]
    if (value === undefined) return

    clearTimeout(timersRef.current.get(key))
    pendingSavesRef.current.set(key, {
      id_item: itemId,
      campo: field,
      valor: value,
      remisionId,
    })
    setHasPending(true)
    timersRef.current.set(key, setTimeout(() => startPendingSave(key), SAVE_DELAY_MS))
  }, [draftFields, remisionId, startPendingSave])

  const flushAndWait = useCallback(async () => {
    while (pendingSavesRef.current.size > 0 || requestChainsRef.current.size > 0) {
      for (const key of [...pendingSavesRef.current.keys()]) startPendingSave(key)
      const activeRequests = [...requestChainsRef.current.values()]
      if (activeRequests.length > 0) await Promise.allSettled(activeRequests)
    }

    const firstError = saveErrorsRef.current.values().next().value
    if (firstError) throw firstError
  }, [startPendingSave])

  return {
    draftFields,
    flushAndWait,
    getDraftField,
    hasPending,
    isSaving: hasPending,
    mutation,
    saveField,
    setDraftField,
  }
}
