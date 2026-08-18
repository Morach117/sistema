import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Swal from 'sweetalert2'
import api from '@/lib/api'

const SAVE_DELAY_MS = 250
const fieldKey = (itemId, field) => `${itemId}:${field}`

export function useReceptionEditor(remisionId, {
  endpoint = '/api/recepciones/actualizar_campo',
  queryKeyPrefix = 'recepciones_detail',
} = {}) {
  const queryClient = useQueryClient()
  const [draftFields, setDraftFields] = useState({})
  const [hasPending, setHasPending] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const timersRef = useRef(new Map())
  const pendingSavesRef = useRef(new Map())
  const requestChainsRef = useRef(new Map())
  const saveErrorsRef = useRef(new Map())
  const saveGenerationRef = useRef(0)
  const latestFieldSaveRef = useRef({ generation: 0, status: 'idle' })
  const mutationRef = useRef(null)

  const mutation = useMutation({
    mutationFn: ({ id_item, campo, valor }) => api.post(endpoint, { id_item, campo, valor }),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({
      queryKey: [queryKeyPrefix, variables.remisionId],
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
    saveGenerationRef.current += 1
    latestFieldSaveRef.current = { generation: saveGenerationRef.current, status: 'idle' }
    setSaveState('idle')
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

  const settleFieldSaveState = useCallback((generation, status) => {
    if (generation === saveGenerationRef.current) {
      latestFieldSaveRef.current = { generation, status }
    }

    const hasPendingFieldSave = pendingSavesRef.current.size > 0
      || [...requestChainsRef.current.keys()].some((key) => !key.startsWith('operation:'))
    const latest = latestFieldSaveRef.current
    if (!hasPendingFieldSave && latest.generation === saveGenerationRef.current && latest.status !== 'saving') {
      setSaveState(latest.status)
    }
  }, [])

  const trackRequest = useCallback((key, operation, operationRemisionId) => {
    const previousRequest = requestChainsRef.current.get(key) || Promise.resolve()
    const nextRequest = previousRequest
      .catch(() => undefined)
      .then(operation)

    requestChainsRef.current.set(key, nextRequest)
    refreshPendingState()

    nextRequest.then(
      () => saveErrorsRef.current.delete(key),
      (error) => saveErrorsRef.current.set(key, {
        error,
        remisionId: operationRemisionId,
      }),
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

  const startPendingSave = useCallback((key) => {
    const variables = pendingSavesRef.current.get(key)
    if (!variables) return requestChainsRef.current.get(key)

    clearTimeout(timersRef.current.get(key))
    timersRef.current.delete(key)
    pendingSavesRef.current.delete(key)
    const request = trackRequest(
      key,
      () => mutationRef.current.mutateAsync(variables),
      variables.remisionId,
    )
    request.then(
      () => settleFieldSaveState(variables.saveGeneration, 'saved'),
      () => settleFieldSaveState(variables.saveGeneration, 'error'),
    )
    return request
  }, [settleFieldSaveState, trackRequest])

  const saveField = useCallback((itemId, field, explicitValue) => {
    const key = fieldKey(itemId, field)
    const value = explicitValue === undefined ? draftFields[key] : explicitValue
    if (value === undefined) return

    const saveGeneration = saveGenerationRef.current + 1
    saveGenerationRef.current = saveGeneration
    latestFieldSaveRef.current = { generation: saveGeneration, status: 'saving' }
    setSaveState('saving')
    clearTimeout(timersRef.current.get(key))
    pendingSavesRef.current.set(key, {
      id_item: itemId,
      campo: field,
      valor: value,
      remisionId,
      saveGeneration,
    })
    setHasPending(true)
    timersRef.current.set(key, setTimeout(() => startPendingSave(key), SAVE_DELAY_MS))
  }, [draftFields, remisionId, startPendingSave])

  const runTrackedOperation = useCallback((operationKey, operation) => trackRequest(
    `operation:${operationKey}`,
    operation,
    remisionId,
  ), [remisionId, trackRequest])

  const flushAndWait = useCallback(async () => {
    while (pendingSavesRef.current.size > 0 || requestChainsRef.current.size > 0) {
      for (const key of [...pendingSavesRef.current.keys()]) startPendingSave(key)
      const activeRequests = [...requestChainsRef.current.values()]
      if (activeRequests.length > 0) await Promise.allSettled(activeRequests)
    }

    const failedSave = [...saveErrorsRef.current.values()]
      .find((entry) => entry.remisionId === remisionId)
    if (failedSave) throw failedSave.error
  }, [remisionId, startPendingSave])

  return {
    draftFields,
    flushAndWait,
    getDraftField,
    hasPending,
    isSaving: hasPending,
    mutation,
    runTrackedOperation,
    saveState,
    saveField,
    setDraftField,
  }
}
