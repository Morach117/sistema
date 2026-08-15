import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Swal from 'sweetalert2'
import api from '@/lib/api'

const SAVE_DELAY_MS = 250
const fieldKey = (itemId, field) => `${itemId}:${field}`

export function useReceptionEditor(remisionId) {
  const queryClient = useQueryClient()
  const [draftFields, setDraftFields] = useState({})
  const timersRef = useRef(new Map())
  const controllersRef = useRef(new Map())

  const mutation = useMutation({
    mutationFn: ({ id_item, campo, valor, signal }) => api.post(
      '/api/recepciones/actualizar_campo',
      { id_item, campo, valor },
      { signal },
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recepciones_detail', remisionId] }),
    onError: (error) => {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: error.response?.data?.error || 'Error',
        showConfirmButton: false,
        timer: 1500,
      })
    },
    onSettled: (_data, _error, variables) => {
      const key = fieldKey(variables.id_item, variables.campo)
      if (controllersRef.current.get(key)?.signal === variables.signal) {
        controllersRef.current.delete(key)
      }
    },
  })

  const cancelPendingSaves = useCallback(() => {
    for (const timeoutId of timersRef.current.values()) clearTimeout(timeoutId)
    for (const controller of controllersRef.current.values()) controller.abort()
    timersRef.current.clear()
    controllersRef.current.clear()
  }, [])

  useEffect(() => {
    setDraftFields({})
    cancelPendingSaves()
    return cancelPendingSaves
  }, [cancelPendingSaves, remisionId])

  const setDraftField = useCallback((itemId, field, value) => {
    setDraftFields((current) => ({ ...current, [fieldKey(itemId, field)]: value }))
  }, [])

  const getDraftField = useCallback((itemId, field, fallback = '') => {
    const key = fieldKey(itemId, field)
    return Object.prototype.hasOwnProperty.call(draftFields, key) ? draftFields[key] : fallback
  }, [draftFields])

  const saveField = useCallback((itemId, field, explicitValue) => {
    const key = fieldKey(itemId, field)
    const value = explicitValue ?? draftFields[key]
    if (value === undefined) return

    clearTimeout(timersRef.current.get(key))
    controllersRef.current.get(key)?.abort()

    const controller = new AbortController()
    controllersRef.current.set(key, controller)
    timersRef.current.set(key, setTimeout(() => {
      timersRef.current.delete(key)
      mutation.mutate({ id_item: itemId, campo: field, valor: value, signal: controller.signal })
    }, SAVE_DELAY_MS))
  }, [draftFields, mutation])

  return {
    cancelPendingSaves,
    draftFields,
    getDraftField,
    isSaving: mutation.isPending,
    mutation,
    saveField,
    setDraftField,
  }
}
