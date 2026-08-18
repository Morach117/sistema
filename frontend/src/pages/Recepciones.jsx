import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  FileSpreadsheet,
  History,
  Loader2,
  PackageCheck,
  PackageOpen,
  Save,
  ShoppingCart,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import Swal from 'sweetalert2'
import api from '@/lib/api'
import { canAccess } from '@/auth/permissions'
import { readSession } from '@/auth/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import {
  buildReceptionSummary,
  calculateCost,
  calculatePresentation,
  displayNumber,
  invoicePhysicalDifference,
  validateReceptionItems,
} from '@/features/recepciones/receptionCalculations'
import { useReceptionEditor } from '@/features/recepciones/useReceptionEditor'

const PROVIDERS = [
  { value: 'custom', label: 'Manual' },
  { value: 'paola', label: 'Paola / Operadora' },
  { value: 'tony', label: 'Tony' },
  { value: 'optivosa', label: 'Optivosa' },
  { value: 'sindesc', label: 'Sin descuentos' },
]

const DISCOUNT_PERCENT = 5

function automaticDiscountAnnouncement(provider) {
  if (provider === 'paola') return `Descuento automático: Paola aplica ${DISCOUNT_PERCENT}% a todos los artículos.`
  if (provider === 'tony') return 'Descuento automático: Tony se detecta artículo por artículo desde el XML.'
  if (provider === 'optivosa' || provider === 'sindesc') return 'Descuento automático: este proveedor no aplica descuento.'
  return 'Descuento automático: no aplica con proveedor manual.'
}

const formatMoney = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
})

const formatDate = (value) => {
  if (!value) return 'Sin fecha'
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('es-MX')
}

function downloadResponse(response, fallbackName) {
  const disposition = response.headers?.['content-disposition'] || ''
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i)
  const blobUrl = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filenameMatch?.[1] || fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(blobUrl)
}

function SicarInput({ item, editor, disabled, canValidateCatalog }) {
  const value = editor.getDraftField(item.id, 'clave_final', item.clave_final || item.clave_sicar || '')
  const [debouncedValue] = useDebounce(value, 600)
  const [description, setDescription] = useState('')
  const [validating, setValidating] = useState(false)
  const [sicarStatus, setSicarStatus] = useState('pending')

  useEffect(() => {
    if (!debouncedValue || debouncedValue === 'FALTANTE' || debouncedValue === 'DEVOLUCION') {
      setDescription('')
      setSicarStatus('pending')
      setValidating(false)
      return undefined
    }
    if (!canValidateCatalog) {
      setDescription('Validación de catálogo no disponible con tus permisos')
      setSicarStatus('pending')
      setValidating(false)
      return undefined
    }

    let alive = true
    setValidating(true)
    api.get('/api/catalogo/list', { params: { page: 1, limit: 25, search: debouncedValue } })
      .then((response) => {
        if (!alive) return
        const result = (response.data?.data || []).find((candidate) => [candidate.clave_sicar, candidate.codigo_barras]
          .some((code) => String(code || '').toUpperCase() === debouncedValue.toUpperCase()))
        setSicarStatus(result ? 'confirmed' : 'mismatch')
        setDescription(result ? result.descripcion : 'El código no coincide con el catálogo')
      })
      .catch(() => {
        if (!alive) return
        setSicarStatus('pending')
        setDescription('El catálogo no está disponible para validar este código')
      })
      .finally(() => { if (alive) setValidating(false) })
    return () => { alive = false }
  }, [canValidateCatalog, debouncedValue])

  return (
    <div className="space-y-1">
      <div className="flex min-h-10 items-center overflow-hidden rounded-lg border border-border bg-background">
        <span className="border-r border-border bg-secondary px-2 py-2 font-mono text-[10px] font-bold text-muted-foreground">
          {item.cod_prov || 'SIN-CÓDIGO'}
        </span>
        <label htmlFor={`sicar-${item.id}`} className="sr-only">SICAR de artículo {item.desc}</label>
        <input
          id={`sicar-${item.id}`}
          type="text"
          value={value}
          disabled={disabled}
          placeholder="Clave SICAR"
          onChange={(event) => {
            setSicarStatus('pending')
            setDescription('')
            editor.setDraftField(item.id, 'clave_final', event.target.value)
            editor.saveField(item.id, 'clave_final', event.target.value)
          }}
          onBlur={(event) => editor.saveField(item.id, 'clave_final', event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              editor.saveField(item.id, 'clave_final', event.currentTarget.value)
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        {validating && <Loader2 aria-hidden="true" className="mr-3 h-4 w-4 animate-spin text-muted-foreground" />}
        {value && !validating && !disabled && (
          <button
            type="button"
            aria-label="Limpiar clave SICAR"
            onClick={() => {
              editor.setDraftField(item.id, 'clave_final', '')
              editor.saveField(item.id, 'clave_final', '')
            }}
            className="mr-1 inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
      <p aria-live="polite" className={`text-[10px] font-bold ${sicarStatus === 'confirmed' ? 'text-emerald-600 dark:text-emerald-400' : sicarStatus === 'mismatch' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
        {sicarStatus === 'confirmed'
          ? `SICAR confirmado${description ? ` · ${description}` : ''}`
          : sicarStatus === 'mismatch'
            ? `SICAR no coincide${description ? ` · ${description}` : ''}`
            : `SICAR pendiente${description ? ` · ${description}` : ''}`}
      </p>
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, tone = 'text-primary' }) {
  return (
    <Card className="border-border bg-card/80 p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-secondary ${tone}`}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-black">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function PreviewSummary({ entry }) {
  const classification = {
    nuevo: 'Nuevo',
    'actualiza-pendiente': 'Actualiza pendiente',
    'folio-finalizado': 'Folio finalizado',
  }[entry.clasificacion] || entry.clasificacion
  const summary = entry.resumen || {}
  const amount = summary.cajas > 0
    ? `${displayNumber(summary.cajas)} cajas`
    : `${displayNumber(summary.piezas)} piezas`

  return (
    <li className={`rounded-xl border p-3 ${entry.puedeGuardar ? 'border-border bg-secondary/40' : 'border-destructive/40 bg-destructive/10'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-black">{entry.folio}</span>
        <span className="rounded-full border border-border px-2 py-1 text-[10px] font-black uppercase tracking-wider">{classification}</span>
      </div>
      <p className="mt-2 text-xs font-bold text-muted-foreground">
        {summary.productos || 0} {summary.productos === 1 ? 'artículo' : 'artículos'} · {amount} · {formatMoney(summary.costoTotal)}
      </p>
      {entry.issues?.length > 0 && (
        <p className="mt-1 text-xs font-bold text-destructive">{entry.issues.length} incidencias detectadas</p>
      )}
    </li>
  )
}

export default function Recepciones() {
  const queryClient = useQueryClient()
  const sessionUser = readSession()?.user
  const canValidateCatalog = canAccess(sessionUser, 'catalogo')
  const canViewPriceHistory = canAccess(sessionUser, 'evolucion-precios')
  const canManageNotes = sessionUser?.rol === 'admin'
  const [selectedRemision, setSelectedRemision] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState('custom')
  const [includePhysical, setIncludePhysical] = useState(false)
  const [selectedItems, setSelectedItems] = useState([])
  const [bulkPresentation, setBulkPresentation] = useState('pieza')
  const [bulkPieces, setBulkPieces] = useState(1)
  const [bulkDiscount, setBulkDiscount] = useState('automatico')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFiles, setUploadFiles] = useState([])
  const [uploadPreview, setUploadPreview] = useState(null)
  const [priceHistoryItem, setPriceHistoryItem] = useState(null)
  const [noteTarget, setNoteTarget] = useState('factura')
  const [noteText, setNoteText] = useState('')
  const [showAllIssues, setShowAllIssues] = useState(false)
  const editor = useReceptionEditor(selectedRemision)

  const { data: remisiones = [], isLoading: loadingList } = useQuery({
    queryKey: ['recepciones_list'],
    queryFn: async () => (await api.get('/api/recepciones')).data.data || [],
    refetchInterval: 10_000,
  })

  const { data: remisionDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['recepciones_detail', selectedRemision],
    queryFn: async () => (await api.get(`/api/recepciones/${selectedRemision}`)).data,
    enabled: Boolean(selectedRemision),
  })

  const { data: noteDetails } = useQuery({
    queryKey: ['active_reception_notes', selectedRemision],
    queryFn: async () => (await api.get(`/api/historial-recepciones/${selectedRemision}`)).data,
    enabled: Boolean(selectedRemision && canManageNotes),
  })

  const priceHistoryKey = priceHistoryItem?.clave_final || priceHistoryItem?.clave_sicar || priceHistoryItem?.cod_prov
  const { data: priceHistory = [], isLoading: loadingPriceHistory } = useQuery({
    queryKey: ['reception_price_history', priceHistoryKey],
    queryFn: async () => (await api.get('/api/evolucion-precios', { params: { buscar_codigo: priceHistoryKey } })).data.data || [],
    enabled: Boolean(canViewPriceHistory && priceHistoryKey),
  })

  useEffect(() => {
    const provider = String(remisionDetails?.proveedor || '').toUpperCase()
    if (!provider) return
    if (provider.includes('PAOLA') || provider.includes('OPERADORA')) setSelectedProvider('paola')
    else if (provider.includes('TONY')) setSelectedProvider('tony')
    else if (provider.includes('OPTIVOSA')) setSelectedProvider('optivosa')
    else if (provider.includes('SINDESC')) setSelectedProvider('sindesc')
    else setSelectedProvider('custom')
  }, [remisionDetails?.proveedor])

  useEffect(() => {
    setSelectedItems([])
    setPriceHistoryItem(null)
    setIncludePhysical(false)
    setNoteTarget('factura')
    setNoteText('')
  }, [selectedRemision])

  const remisionCode = remisionDetails?.datos ? Object.keys(remisionDetails.datos)[0] : null
  const persistedItems = useMemo(
    () => (remisionCode ? remisionDetails?.datos?.[remisionCode] || [] : []),
    [remisionCode, remisionDetails?.datos],
  )
  const items = useMemo(() => persistedItems.map((item) => ({
    ...item,
    proveedor: remisionDetails?.proveedor,
    cantidad: editor.getDraftField(item.id, 'cantidad', item.cant ?? item.cantidad ?? 0),
    cant: editor.getDraftField(item.id, 'cantidad', item.cant ?? item.cantidad ?? 0),
    costo_unitario: editor.getDraftField(item.id, 'costo_unitario', item.costo_unitario ?? item.costo ?? 0),
    clave_final: editor.getDraftField(item.id, 'clave_final', item.clave_final || item.clave_sicar || ''),
    existencia_lapiz: editor.getDraftField(item.id, 'existencia_lapiz', item.existencia_lapiz ?? 0),
    es_paquete: editor.getDraftField(item.id, 'es_paquete', item.es_paquete ?? 0),
    piezas_por_paquete: editor.getDraftField(item.id, 'piezas_por_paquete', item.piezas_por_paquete ?? 1),
    aplica_descuento_manual: editor.getDraftField(item.id, 'aplica_descuento_manual', item.aplica_descuento_manual),
    revision_pendiente: editor.getDraftField(item.id, 'revision_pendiente', item.revision_pendiente ?? 0),
  })), [editor, persistedItems, remisionDetails?.proveedor])
  const finalised = remisionDetails?.estado === 'FINALIZADO'
  const automaticDiscountLabel = automaticDiscountAnnouncement(selectedProvider)
  const issues = useMemo(() => validateReceptionItems(items), [items])
  const blockingIssues = issues.filter((issue) => issue.severity === 'error')
  const validationBlocksFinalize = blockingIssues.length > 0
  const summary = useMemo(() => buildReceptionSummary(items, {
    proveedor: remisionDetails?.proveedor,
    porcentaje: DISCOUNT_PERCENT,
  }), [items, remisionDetails?.proveedor])

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/recepciones/item/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recepciones_detail', selectedRemision] }),
    onError: (error) => Swal.fire('Error', error.response?.data?.error || 'Fallo al eliminar', 'error'),
  })
  const finalizeMutation = useMutation({
    mutationFn: (numeroRemision) => api.post('/api/recepciones/finalizar', { remision_id: numeroRemision }),
    onSuccess: () => {
      Swal.fire('Finalizado', 'La orden fue cerrada exitosamente.', 'success')
      setSelectedRemision(null)
      queryClient.invalidateQueries({ queryKey: ['recepciones_list'] })
    },
    onError: (error) => Swal.fire('Error', error.response?.data?.error || 'Fallo al finalizar', 'error'),
  })
  const previewMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      uploadFiles.forEach((file) => formData.append('archivo_factura', file))
      return api.post('/api/recepciones/preview-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: (response) => setUploadPreview(response.data),
    onError: (error) => Swal.fire('Error', error.response?.data?.error || 'No se pudo generar la vista previa', 'error'),
  })
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      uploadFiles.forEach((file) => formData.append('archivo_factura', file))
      return api.post('/api/recepciones/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: (response) => {
      Swal.fire('Procesado', response.data.mensaje || 'Archivos procesados', 'success')
      setShowUploadModal(false)
      setUploadFiles([])
      setUploadPreview(null)
      queryClient.invalidateQueries({ queryKey: ['recepciones_list'] })
      if (response.data.id_remision) {
        const importedRemision = String(response.data.id_remision) === String(selectedRemision)
          ? selectedRemision
          : response.data.id_remision
        queryClient.invalidateQueries({ queryKey: ['recepciones_detail', importedRemision] })
        queryClient.invalidateQueries({ queryKey: ['active_reception_notes', importedRemision] })
        setSelectedRemision(importedRemision)
      }
    },
    onError: (error) => Swal.fire('Error', error.response?.data?.error || 'Fallo al subir', 'error'),
  })
  const noteMutation = useMutation({
    mutationFn: () => api.post(`/api/historial-recepciones/${selectedRemision}/notas`, {
      nota: noteText,
      item_id: noteTarget === 'factura' ? null : Number(noteTarget),
    }),
    onSuccess: () => {
      setNoteText('')
      queryClient.invalidateQueries({ queryKey: ['active_reception_notes', selectedRemision] })
    },
    onError: (error) => Swal.fire('Error', error.response?.data?.error || 'No se pudo guardar la nota', 'error'),
  })

  const saveOnEnter = (event, itemId, field) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    editor.saveField(itemId, field, event.currentTarget.value)
  }

  const updateField = (itemId, field, value) => {
    editor.setDraftField(itemId, field, value)
    editor.saveField(itemId, field, value)
  }

  const waitForSavedEdits = async (actionLabel) => {
    try {
      await editor.flushAndWait()
      return true
    } catch {
      await Swal.fire({
        title: 'Cambios sin guardar',
        text: `No se puede ${actionLabel} porque una operación de la recepción no se completó. Reinténtala y vuelve a continuar.`,
        icon: 'error',
      })
      return false
    }
  }

  const handleDelete = async (id, description) => {
    const result = await Swal.fire({
      title: '¿Eliminar ítem?',
      text: `${description}\n\nSe borrará permanentemente de la BD.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    })
    if (!result.isConfirmed) return
    editor.runTrackedOperation(`delete:${id}`, () => deleteMutation.mutateAsync(id)).catch(() => undefined)
  }

  const handleFinalize = async () => {
    if (validationBlocksFinalize) return
    const result = await Swal.fire({
      title: '¿Cerrar Inventario?',
      text: 'Una vez finalizado no se podrá editar.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, finalizar',
      cancelButtonText: 'Cancelar',
    })
    if (result.isConfirmed && await waitForSavedEdits('finalizar la recepción')) finalizeMutation.mutate(remisionCode)
  }

  const handleExport = async () => {
    if (!await waitForSavedEdits('generar el Excel')) return
    try {
      const response = await api.post('/api/recepciones/generar_excel', {
        remision_id: remisionCode,
        incluir_fisico: includePhysical,
      }, { responseType: 'blob' })
      downloadResponse(response, `Carga_Sicar_${remisionCode}.xls`)
    } catch (error) {
      Swal.fire('Error', error.response?.data?.error || 'No se pudo generar el archivo', 'error')
    }
  }

  const handleUpload = async () => {
    if (!await waitForSavedEdits('importar o reimportar archivos')) return
    uploadMutation.mutate()
  }

  const handleProviderChange = (provider) => {
    const previous = selectedProvider
    setSelectedProvider(provider)
    editor.runTrackedOperation('provider', () => api.post('/api/recepciones/asignar_proveedor', {
      id_remision: selectedRemision,
      proveedor: provider,
    }))
      .then(() => queryClient.invalidateQueries({ queryKey: ['recepciones_detail', selectedRemision] }))
      .catch((error) => {
        setSelectedProvider(previous)
        Swal.fire('Error', error.response?.data?.error || 'No se pudo cambiar el proveedor', 'error')
      })
  }

  const applyBulk = () => {
    const packageValue = bulkPresentation === 'caja' ? 1 : 0
    const discountValue = bulkDiscount === 'automatico' ? null : bulkDiscount === 'aplicar' ? 1 : 0
    selectedItems.forEach((itemId) => {
      updateField(itemId, 'es_paquete', packageValue)
      updateField(itemId, 'piezas_por_paquete', packageValue ? Number(bulkPieces) : 1)
      updateField(itemId, 'aplica_descuento_manual', discountValue)
    })
  }

  const selectAll = (checked) => setSelectedItems(checked ? items.map((item) => item.id) : [])
  const toggleItem = (itemId, checked) => setSelectedItems((current) => (
    checked ? [...new Set([...current, itemId])] : current.filter((id) => id !== itemId)
  ))

  return (
    <Dialog
      open={showUploadModal}
      onOpenChange={(open) => {
        setShowUploadModal(open)
        if (!open) {
          setUploadFiles([])
          setUploadPreview(null)
        }
      }}
    >
      <div className="mx-auto flex min-h-full max-w-screen-2xl flex-col gap-5 pb-10 xl:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-72">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight">Tareas</h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Recepción activa</p>
            </div>
            <DialogTrigger asChild>
              <Button size="sm" className="min-h-11 gap-2 font-black">
                <Upload aria-hidden="true" className="h-4 w-4" /> Subir XML
              </Button>
            </DialogTrigger>
          </div>

          <div className="custom-scrollbar flex gap-3 overflow-x-auto pb-2 xl:flex-1 xl:flex-col xl:overflow-y-auto">
            {loadingList ? (
              <LoadingState compact label="Cargando recepciones…" />
            ) : remisiones.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Todo al día" className="min-h-40" />
            ) : remisiones.map((row) => (
              <button
                type="button"
                key={row.id}
                aria-pressed={selectedRemision === row.id}
                onClick={() => setSelectedRemision(row.id)}
                className={`min-w-60 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-w-0 ${
                  selectedRemision === row.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-black">{row.numero_remision}</h3>
                  <span className="rounded-full border border-border px-2 py-1 text-[9px] font-black uppercase">{row.estado}</span>
                </div>
                <p className="mt-2 text-xs font-bold text-muted-foreground">{formatDate(row.fecha_carga)} · {row.items} artículos</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          {!selectedRemision ? (
            <Card className="flex min-h-96 flex-col items-center justify-center border-dashed text-center">
              <PackageOpen aria-hidden="true" className="mb-4 h-16 w-16 text-muted-foreground/40" />
              <h1 className="text-xl font-black">Selecciona una tarea</h1>
              <p className="mt-2 max-w-sm text-sm font-bold text-muted-foreground">Revisa factura, conteo físico, presentación, costo y validaciones antes de finalizar.</p>
            </Card>
          ) : loadingDetails ? (
            <LoadingState label="Cargando detalle de recepción…" className="min-h-96" />
          ) : remisionDetails?.datos ? (
            <div className="space-y-4">
              <Card className="border-border bg-card/90 p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h1 className="text-2xl font-black tracking-tight">Orden #{remisionCode}</h1>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">Factura y conteo físico se conservan como valores distintos.</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label htmlFor="reception-provider" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">PROV</label>
                      <select
                        id="reception-provider"
                        value={selectedProvider}
                        disabled={finalised || editor.hasPending}
                        onChange={(event) => handleProviderChange(event.target.value)}
                        className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
                      </select>
                    </div>
                    <div aria-label={automaticDiscountLabel} className="flex min-h-11 max-w-64 flex-col justify-center rounded-lg border border-border bg-secondary/50 px-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">DTO automático</span>
                      <span className="text-xs font-black">{automaticDiscountLabel.replace('Descuento automático: ', '')}</span>
                    </div>
                    {!finalised && (
                      <>
                        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-bold">
                          <input
                            type="checkbox"
                            checked={includePhysical}
                            onChange={(event) => setIncludePhysical(event.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                          Incluir conteo físico
                        </label>
                        <Button variant="outline" className="min-h-11 gap-2 font-black" disabled={editor.hasPending} onClick={handleExport}>
                          <FileSpreadsheet aria-hidden="true" className="h-4 w-4" /> Excel
                        </Button>
                        <Button className="min-h-11 gap-2 font-black" disabled={editor.hasPending || finalizeMutation.isPending || validationBlocksFinalize} onClick={handleFinalize}>
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Finalizar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {editor.saveState !== 'idle' && (
                  <p role="status" aria-live="polite" className={`mt-3 flex items-center gap-2 text-xs font-bold ${editor.saveState === 'error' ? 'text-destructive' : editor.saveState === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                    {editor.saveState === 'saving' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : editor.saveState === 'saved' ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : <AlertCircle aria-hidden="true" className="h-4 w-4" />}
                    {editor.saveState === 'saving' ? 'Guardando cambios…' : editor.saveState === 'saved' ? 'Cambios guardados' : 'No se pudieron guardar los cambios'}
                  </p>
                )}
              </Card>

              <section aria-label="Resumen de recepción" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <SummaryCard label="Artículos" value={summary.productos} icon={ShoppingCart} />
                <SummaryCard label="Cajas" value={displayNumber(summary.cajas)} icon={Boxes} />
                <SummaryCard label="Piezas" value={displayNumber(summary.piezas)} icon={PackageCheck} />
                <SummaryCard label="Costo" value={formatMoney(summary.costoTotal)} icon={FileSpreadsheet} />
                <SummaryCard label="Revisión" value={summary.articulosRevision} icon={ClipboardCheck} tone="text-amber-500" />
                <SummaryCard label="Errores" value={summary.errores} icon={AlertCircle} tone={summary.errores ? 'text-destructive' : 'text-emerald-500'} />
              </section>

              <section aria-label="Revisión antes de finalizar" className={`rounded-xl border p-4 ${blockingIssues.length ? 'border-destructive/40 bg-destructive/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                  {blockingIssues.length ? <AlertCircle aria-hidden="true" className="h-5 w-5 text-destructive" /> : <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-500" />}
                    <div>
                      <h2 className="font-black">Revisión antes de finalizar</h2>
                      <p className="text-xs font-bold text-muted-foreground">{issues.length ? `${issues.length} puntos por resolver` : 'Listo para finalizar'}</p>
                    </div>
                  </div>
                  {issues.length > 3 && (
                    <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => setShowAllIssues((current) => !current)}>
                      {showAllIssues ? 'Ocultar detalles' : `Ver los ${issues.length} errores`}
                    </Button>
                  )}
                </div>
                {issues.length === 0 ? (
                  <p className="mt-2 text-sm font-bold text-muted-foreground">Sin errores bloqueantes.</p>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-sm font-bold">
                    {(showAllIssues ? issues : issues.slice(0, 3)).map((issue) => <li key={`${issue.itemId}-${issue.code}`}>{issue.message}</li>)}
                  </ul>
                )}
              </section>

              {!finalised && items.length > 0 && (
                <Card className="border-border bg-card/90 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                    <label className="flex min-h-11 items-center gap-2 text-sm font-black">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todo"
                        checked={selectedItems.length === items.length}
                        onChange={(event) => selectAll(event.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      {selectedItems.length} seleccionados
                    </label>
                    <div className="grid flex-1 gap-3 sm:grid-cols-3">
                      <label className="text-xs font-black text-muted-foreground">
                        Presentación masiva
                        <select value={bulkPresentation} onChange={(event) => setBulkPresentation(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground">
                          <option value="pieza">Pieza</option>
                          <option value="caja">Caja</option>
                        </select>
                      </label>
                      <label className="text-xs font-black text-muted-foreground">
                        Piezas por caja masiva
                        <input type="number" min="1" value={bulkPieces} disabled={bulkPresentation !== 'caja'} onChange={(event) => setBulkPieces(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground disabled:opacity-50" />
                      </label>
                      <label className="text-xs font-black text-muted-foreground">
                        Descuento masivo
                        <select value={bulkDiscount} onChange={(event) => setBulkDiscount(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground">
                          <option value="automatico">Automático</option>
                          <option value="aplicar">Aplicar</option>
                          <option value="no-aplicar">No aplicar</option>
                        </select>
                      </label>
                    </div>
                    <Button type="button" className="min-h-11 font-black" disabled={selectedItems.length === 0 || editor.hasPending} onClick={applyBulk}>
                      Aplicar a {selectedItems.length} artículos
                    </Button>
                  </div>
                </Card>
              )}

              <div className="space-y-4">
                {items.map((item) => {
                  let presentation
                  let difference
                  try {
                    presentation = calculatePresentation({ cantidad: item.cantidad, esPaquete: item.es_paquete, piezasPorPaquete: item.piezas_por_paquete })
                    difference = invoicePhysicalDifference(item)
                  } catch {
                    presentation = null
                    difference = null
                  }
                  const cost = calculateCost(item, { proveedor: remisionDetails.proveedor, porcentaje: DISCOUNT_PERCENT })
                  const rejected = Number(item.revision_pendiente) === 2
                  const discountLabel = cost.descuento.origen === 'manual'
                    ? `Excepción manual: ${cost.descuento.aplica ? 'aplicar descuento' : 'sin descuento'}`
                    : `Descuento automático: ${cost.descuento.origen}`
                  const unit = presentation?.esPaquete ? 'cajas' : 'piezas'
                  const differenceSign = difference?.diferencia > 0 ? '+' : ''

                  return (
                    <Card key={item.id} className={`overflow-hidden border shadow-sm ${rejected ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card/90'}`}>
                      <div className="grid gap-4 p-4 xl:grid-cols-[auto_minmax(12rem,1.4fr)_minmax(13rem,1fr)_minmax(13rem,1fr)] xl:items-start">
                        {!finalised && (
                          <label className="flex min-h-11 items-center gap-2 text-xs font-black">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar ${item.desc}`}
                              checked={selectedItems.includes(item.id)}
                              onChange={(event) => toggleItem(item.id, event.target.checked)}
                              className="h-4 w-4 accent-primary"
                            />
                            Seleccionar
                          </label>
                        )}
                        <div className="min-w-0 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-black" title={item.desc}>{item.desc}</h3>
                              <p className="mt-1 text-xs font-bold text-muted-foreground">Artículo #{item.id}</p>
                            </div>
                            {!finalised && (
                              <button type="button" aria-label={`Eliminar ${item.desc}`} disabled={editor.hasPending} onClick={() => handleDelete(item.id, item.desc)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <SicarInput item={item} editor={editor} disabled={finalised} canValidateCatalog={canValidateCatalog} />
                          {canViewPriceHistory && (
                            <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-2 px-2 text-xs font-black" onClick={() => setPriceHistoryItem((current) => current?.id === item.id ? null : item)}>
                              <History aria-hidden="true" className="h-4 w-4" /> Compras previas de {item.desc}
                            </Button>
                          )}
                        </div>

                        <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Factura y físico</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs font-black text-muted-foreground">
                              FACTURA
                              <input
                                aria-label={`FACTURA ${item.desc}`}
                                type="number"
                                value={item.cantidad}
                                disabled={finalised}
                                onChange={(event) => editor.setDraftField(item.id, 'cantidad', event.target.value)}
                                onBlur={(event) => editor.saveField(item.id, 'cantidad', event.target.value)}
                                onKeyDown={(event) => saveOnEnter(event, item.id, 'cantidad')}
                                className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-lg font-black text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              />
                            </label>
                            <label className="text-xs font-black text-muted-foreground">
                              FÍSICO
                              <input
                                aria-label={`FÍSICO ${item.desc}`}
                                type="number"
                                value={item.existencia_lapiz}
                                disabled={finalised}
                                onChange={(event) => editor.setDraftField(item.id, 'existencia_lapiz', event.target.value)}
                                onBlur={(event) => editor.saveField(item.id, 'existencia_lapiz', event.target.value)}
                                onKeyDown={(event) => saveOnEnter(event, item.id, 'existencia_lapiz')}
                                className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-lg font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="flex min-h-11 items-center gap-2 text-xs font-black">
                              <input type="checkbox" checked={Boolean(Number(item.es_paquete))} disabled={finalised} onChange={(event) => updateField(item.id, 'es_paquete', event.target.checked ? 1 : 0)} className="h-4 w-4 accent-primary" />
                              Es caja
                            </label>
                            <label className="text-xs font-black text-muted-foreground">
                              Piezas por caja
                              <input type="number" min="1" value={item.piezas_por_paquete} disabled={finalised || !Number(item.es_paquete)} onChange={(event) => editor.setDraftField(item.id, 'piezas_por_paquete', event.target.value)} onBlur={(event) => editor.saveField(item.id, 'piezas_por_paquete', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-2 text-center text-foreground disabled:opacity-50" />
                            </label>
                          </div>
                          {presentation ? (
                            <>
                              {presentation.esPaquete && <p className="text-sm font-black">{displayNumber(presentation.cantidadFacturada)} piezas ÷ {displayNumber(presentation.piezasPorPaquete)} = {displayNumber(presentation.cantidadPresentacion)} cajas</p>}
                              <p className="text-xs font-bold text-muted-foreground">Factura {displayNumber(presentation.cantidadPresentacion)} {unit} · Físico {displayNumber(difference.fisico)} · Diferencia {differenceSign}{displayNumber(difference.diferencia)} {unit}</p>
                            </>
                          ) : <p className="text-xs font-bold text-destructive">La configuración de caja no es válida.</p>}
                        </div>

                        <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo y decisión</h4>
                          <label className="block text-xs font-black text-muted-foreground">
                            COSTO FINAL
                            <input
                              aria-label={`COSTO FINAL ${item.desc}`}
                              type="number"
                              step="0.01"
                              value={item.costo_unitario}
                              disabled={finalised}
                              onChange={(event) => editor.setDraftField(item.id, 'costo_unitario', event.target.value)}
                              onBlur={(event) => editor.saveField(item.id, 'costo_unitario', event.target.value)}
                              onKeyDown={(event) => saveOnEnter(event, item.id, 'costo_unitario')}
                              className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-base font-black text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                            />
                          </label>
                          <label className="block text-xs font-black text-muted-foreground">
                            Descuento {item.desc}
                            <select
                              value={item.aplica_descuento_manual === null || item.aplica_descuento_manual === undefined ? 'automatico' : Number(item.aplica_descuento_manual) === 1 ? 'aplicar' : 'no-aplicar'}
                              disabled={finalised}
                              onChange={(event) => updateField(item.id, 'aplica_descuento_manual', event.target.value === 'automatico' ? null : event.target.value === 'aplicar' ? 1 : 0)}
                              className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground disabled:opacity-60"
                            >
                              <option value="automatico">Automático</option>
                              <option value="aplicar">Aplicar excepción</option>
                              <option value="no-aplicar">No aplicar</option>
                            </select>
                          </label>
                          <p className="text-xs font-bold text-muted-foreground">{discountLabel}</p>
                          <p className="text-sm font-black text-primary">Costo neto {formatMoney(cost.costoFinal)}</p>
                          {!finalised && !rejected ? (
                            <Button type="button" variant="outline" className="min-h-11 w-full gap-2 border-destructive/40 text-destructive" onClick={() => updateField(item.id, 'revision_pendiente', 2)}>
                              <XCircle aria-hidden="true" className="h-4 w-4" /> Rechazar
                            </Button>
                          ) : rejected && !finalised ? (
                            <Button type="button" variant="outline" aria-label={`Restaurar ${item.desc}`} className="min-h-11 w-full gap-2 border-amber-500/50 text-amber-700 dark:text-amber-300" onClick={() => updateField(item.id, 'revision_pendiente', 0)}>
                              <Save aria-hidden="true" className="h-4 w-4" /> Restaurar artículo
                            </Button>
                          ) : rejected ? <p className="rounded-lg bg-destructive px-3 py-2 text-center text-xs font-black text-destructive-foreground">REPORTADO</p> : null}
                        </div>
                      </div>

                      {priceHistoryItem?.id === item.id && (
                        <div className="border-t border-border bg-background/60 p-4">
                          <h4 className="flex items-center gap-2 text-sm font-black"><History aria-hidden="true" className="h-4 w-4" /> Compras previas</h4>
                          {loadingPriceHistory ? <LoadingState compact label="Cargando compras previas…" /> : priceHistory.length === 0 ? (
                            <p className="mt-2 text-xs font-bold text-muted-foreground">No hay compras finalizadas previas.</p>
                          ) : (
                            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {priceHistory.slice(0, 6).map((purchase) => (
                                <li key={purchase.id} className="rounded-lg border border-border bg-card p-3 text-xs font-bold">
                                  <p className="font-mono font-black">{purchase.numero_remision}</p>
                                  <p className="mt-1 text-muted-foreground">{purchase.proveedor} · {formatMoney(purchase.costo_unitario)}</p>
                                  <p className="mt-1 text-muted-foreground">{formatDate(purchase.fecha_carga)}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>

              {canManageNotes && (
                <Card className="border-border bg-card/90 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Save aria-hidden="true" className="h-5 w-5 text-primary" />
                    <h2 className="font-black">Notas de factura y artículo</h2>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[12rem_1fr_auto] md:items-end">
                    <label className="text-xs font-black text-muted-foreground">
                      Nota para
                      <select value={noteTarget} onChange={(event) => setNoteTarget(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground">
                        <option value="factura">Factura completa</option>
                        {items.map((item) => <option key={item.id} value={item.id}>{item.desc}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-black text-muted-foreground">
                      Nota
                      <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Escribe una observación verificable" className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </label>
                    <Button type="button" className="min-h-11 font-black" disabled={!noteText.trim() || noteMutation.isPending || editor.hasPending} onClick={() => noteMutation.mutate()}>
                      Guardar nota
                    </Button>
                  </div>
                  {noteDetails?.notas?.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {noteDetails.notas.slice(0, 5).map((note) => (
                        <li key={note.id} className="rounded-lg border border-border bg-secondary/30 p-3 text-xs font-bold">
                          {note.nota} <span className="text-muted-foreground">· {note.usuario}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </div>
          ) : (
            <EmptyState icon={AlertCircle} title="No se pudo cargar la recepción" />
          )}
        </section>
      </div>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-card p-6" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Cargar XML / CSV</DialogTitle>
          <DialogDescription>Primero revisa folios, clasificación, artículos, costo e incidencias; después confirma la importación.</DialogDescription>
        </DialogHeader>
        <form
          className="mt-5 space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (uploadFiles.length === 0) {
              Swal.fire({ icon: 'error', title: 'Selecciona al menos un archivo' })
              return
            }
            previewMutation.mutate()
          }}
        >
          <label htmlFor="reception-upload" className="block text-sm font-black">
            Archivos XML o CSV
          </label>
          <input
            id="reception-upload"
            type="file"
            multiple
            accept=".xml,.csv"
            onChange={(event) => {
              setUploadFiles(Array.from(event.target.files || []))
              setUploadPreview(null)
            }}
            className="w-full rounded-xl border-2 border-dashed border-border bg-background px-4 py-6 text-sm font-bold file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {uploadPreview?.preview?.length > 0 && (
            <section aria-label="Vista previa de archivos">
              <div className="mb-3 flex items-center gap-2">
                <FileSearch aria-hidden="true" className="h-5 w-5 text-primary" />
                <h3 className="font-black">Vista previa</h3>
              </div>
              <ul className="space-y-2">{uploadPreview.preview.map((entry) => <PreviewSummary key={`${entry.folio}-${entry.clasificacion}`} entry={entry} />)}</ul>
            </section>
          )}

          <DialogFooter className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setShowUploadModal(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary" className="min-h-11 gap-2 font-black" disabled={uploadFiles.length === 0 || previewMutation.isPending}>
              {previewMutation.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileSearch aria-hidden="true" className="h-4 w-4" />}
              Revisar archivos
            </Button>
            <Button type="button" className="min-h-11 gap-2 font-black" disabled={!uploadPreview?.puedeGuardar || uploadMutation.isPending || editor.hasPending} onClick={handleUpload}>
              {uploadMutation.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}
              Importar {uploadFiles.length} {uploadFiles.length === 1 ? 'archivo' : 'archivos'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
