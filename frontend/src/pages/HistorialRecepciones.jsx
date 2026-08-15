import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Filter,
  History,
  Loader2,
  PackageSearch,
  Save,
  Search,
  ShieldCheck,
} from 'lucide-react'
import Swal from 'sweetalert2'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import { buildReceptionSummary, displayNumber } from '@/features/recepciones/receptionCalculations'
import { useReceptionEditor } from '@/features/recepciones/useReceptionEditor'

const PAGE_SIZE = 25
const STATES = ['', 'PENDIENTE', 'ENVIADO', 'REVISION', 'FINALIZADO']

const formatMoney = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
})

const formatDate = (value, withTime = false) => {
  if (!value) return 'Sin fecha'
  const parsed = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('es-MX', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' })
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

function stateStyles(state) {
  if (state === 'FINALIZADO') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
  if (state === 'REVISION') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (state === 'PENDIENTE') return 'border-primary/30 bg-primary/10 text-primary'
  return 'border-border bg-secondary text-secondary-foreground'
}

function SummaryValue({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  )
}

function HistoryDetail({ detail, detailId, onClose }) {
  const queryClient = useQueryClient()
  const editable = Boolean(detail?.permisos?.puedeEditar)
  const exportable = Boolean(detail?.permisos?.puedeExportar)
  const [includePhysical, setIncludePhysical] = useState(false)
  const [noteTarget, setNoteTarget] = useState('factura')
  const [noteText, setNoteText] = useState('')
  const [provider, setProvider] = useState(detail?.proveedor || 'MANUAL')
  const editor = useReceptionEditor(detailId, {
    endpoint: '/api/historial-recepciones/actualizar_campo',
    queryKeyPrefix: 'history_reception_detail',
  })

  useEffect(() => setProvider(detail?.proveedor || 'MANUAL'), [detail?.proveedor])
  useEffect(() => {
    setIncludePhysical(false)
    setNoteTarget('factura')
    setNoteText('')
  }, [detailId])

  const folio = detail?.remision?.numero_remision || Object.keys(detail?.datos || {})[0]
  const persistedItems = useMemo(
    () => (folio ? detail?.datos?.[folio] || [] : []),
    [detail?.datos, folio],
  )
  const items = useMemo(() => persistedItems.map((item) => ({
    ...item,
    proveedor: detail?.proveedor,
    cantidad: editor.getDraftField(item.id, 'cantidad', item.cant ?? item.cantidad ?? 0),
    cant: editor.getDraftField(item.id, 'cantidad', item.cant ?? item.cantidad ?? 0),
    costo_unitario: editor.getDraftField(item.id, 'costo_unitario', item.costo_unitario ?? item.costo ?? 0),
    clave_final: editor.getDraftField(item.id, 'clave_final', item.clave_final || item.clave_sicar || ''),
    existencia_lapiz: editor.getDraftField(item.id, 'existencia_lapiz', item.existencia_lapiz ?? 0),
    es_paquete: editor.getDraftField(item.id, 'es_paquete', item.es_paquete ?? 0),
    piezas_por_paquete: editor.getDraftField(item.id, 'piezas_por_paquete', item.piezas_por_paquete ?? 1),
  })), [detail?.proveedor, editor, persistedItems])
  const summary = useMemo(() => buildReceptionSummary(items, { proveedor: detail?.proveedor }), [detail?.proveedor, items])

  const noteMutation = useMutation({
    mutationFn: async () => {
      await editor.flushAndWait()
      return api.post(`/api/historial-recepciones/${detailId}/notas`, {
        nota: noteText,
        item_id: noteTarget === 'factura' ? null : Number(noteTarget),
      })
    },
    onSuccess: () => {
      setNoteText('')
      queryClient.invalidateQueries({ queryKey: ['history_reception_detail', detailId] })
    },
    onError: (error) => Swal.fire('Error', error.response?.data?.error || 'No se pudo guardar la nota', 'error'),
  })

  const providerMutation = useMutation({
    mutationFn: (nextProvider) => editor.runTrackedOperation('provider', () => api.post(
      '/api/historial-recepciones/asignar_proveedor',
      { id_remision: detailId, proveedor: nextProvider },
    )),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history_reception_detail', detailId] }),
    onError: (error) => Swal.fire('Error', error.response?.data?.error || 'No se pudo cambiar el proveedor', 'error'),
  })

  const saveOnEnter = (event, itemId, field) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    editor.saveField(itemId, field, event.currentTarget.value)
  }

  const exportExcel = async () => {
    try {
      await editor.flushAndWait()
      const response = await api.get(`/api/historial-recepciones/${detailId}/excel`, {
        params: { incluir_fisico: includePhysical },
        responseType: 'blob',
      })
      downloadResponse(response, `Carga_Sicar_${folio}.xls`)
    } catch (error) {
      Swal.fire('Error', error.response?.data?.error || 'No se pudo generar el archivo', 'error')
    }
  }

  return (
    <section aria-label={`Detalle de ${folio}`} className="space-y-4">
      <Card className="border-border bg-card/90 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button type="button" onClick={onClose} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-black text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Volver al listado
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight">{folio}</h2>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${stateStyles(detail.estado)}`}>{detail.estado}</span>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${editable ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground'}`}>
                {editable ? 'Edición administrativa' : 'Solo lectura'}
              </span>
            </div>
            <p className="mt-2 text-xs font-bold text-muted-foreground">{formatDate(detail.remision?.fecha_carga, true)}</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-black text-muted-foreground">
              Proveedor
              <input
                value={provider}
                disabled={!editable || editor.hasPending}
                onChange={(event) => setProvider(event.target.value)}
                onBlur={(event) => {
                  if (event.target.value !== detail.proveedor) providerMutation.mutate(event.target.value)
                }}
                className="mt-1 min-h-11 w-48 rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
            </label>
            {exportable && (
              <>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-bold">
                  <input type="checkbox" checked={includePhysical} onChange={(event) => setIncludePhysical(event.target.checked)} className="h-4 w-4 accent-primary" />
                  Incluir conteo físico
                </label>
                <Button type="button" variant="outline" className="min-h-11 gap-2 font-black" disabled={editor.hasPending} onClick={exportExcel}>
                  <FileSpreadsheet aria-hidden="true" className="h-4 w-4" /> Exportar Excel
                </Button>
              </>
            )}
          </div>
        </div>
        {editor.hasPending && <p role="status" className="mt-3 flex items-center gap-2 text-xs font-bold text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Guardando cambios…</p>}
      </Card>

      <section aria-label="Resumen del detalle" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryValue label="Artículos" value={summary.productos} />
        <SummaryValue label="Cajas" value={displayNumber(summary.cajas)} />
        <SummaryValue label="Piezas" value={displayNumber(summary.piezas)} />
        <SummaryValue label="Costo" value={formatMoney(summary.costoTotal)} />
        <SummaryValue label="Revisión" value={summary.articulosRevision} />
        <SummaryValue label="Errores" value={summary.errores} />
      </section>

      <Card className="overflow-hidden border-border bg-card/90 shadow-sm">
        <div className="border-b border-border p-4">
          <h3 className="flex items-center gap-2 font-black"><PackageSearch aria-hidden="true" className="h-5 w-5 text-primary" /> Artículos</h3>
        </div>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <article key={item.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(12rem,1.5fr)_8rem_10rem_10rem] lg:items-end">
              <div className="min-w-0">
                <h4 className="truncate font-black">{item.desc}</h4>
                <p className="mt-1 font-mono text-xs font-bold text-muted-foreground">{item.cod_prov} · {item.clave_final || item.clave_sicar || 'SIN SICAR'}</p>
                <p className="mt-2 text-xs font-bold text-muted-foreground">
                  {Number(item.es_paquete) === 1 ? `${displayNumber(item.cantidad)} piezas ÷ ${displayNumber(item.piezas_por_paquete)} por caja` : `${displayNumber(item.cantidad)} piezas`}
                </p>
              </div>
              <label className="text-xs font-black text-muted-foreground">
                Cantidad de {item.desc}
                <input
                  type="number"
                  value={item.cantidad}
                  disabled={!editable}
                  onChange={(event) => editor.setDraftField(item.id, 'cantidad', event.target.value)}
                  onBlur={(event) => editor.saveField(item.id, 'cantidad', event.target.value)}
                  onKeyDown={(event) => saveOnEnter(event, item.id, 'cantidad')}
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-black text-muted-foreground">
                SICAR de {item.desc}
                <input
                  value={item.clave_final}
                  disabled={!editable}
                  onChange={(event) => editor.setDraftField(item.id, 'clave_final', event.target.value)}
                  onBlur={(event) => editor.saveField(item.id, 'clave_final', event.target.value)}
                  onKeyDown={(event) => saveOnEnter(event, item.id, 'clave_final')}
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-black text-muted-foreground">
                Costo de {item.desc}
                <input
                  type="number"
                  step="0.01"
                  value={item.costo_unitario}
                  disabled={!editable}
                  onChange={(event) => editor.setDraftField(item.id, 'costo_unitario', event.target.value)}
                  onBlur={(event) => editor.saveField(item.id, 'costo_unitario', event.target.value)}
                  onKeyDown={(event) => saveOnEnter(event, item.id, 'costo_unitario')}
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </label>
            </article>
          ))}
        </div>
      </Card>

      {editable && (
        <Card className="border-border bg-card/90 p-4 shadow-sm">
          <h3 className="flex items-center gap-2 font-black"><Save aria-hidden="true" className="h-5 w-5 text-primary" /> Nueva nota</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-[12rem_1fr_auto] md:items-end">
            <label className="text-xs font-black text-muted-foreground">
              Nota para
              <select value={noteTarget} onChange={(event) => setNoteTarget(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground">
                <option value="factura">Factura completa</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.desc}</option>)}
              </select>
            </label>
            <label className="text-xs font-black text-muted-foreground">
              Contenido
              <input value={noteText} onChange={(event) => setNoteText(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            <Button type="button" className="min-h-11 font-black" disabled={!noteText.trim() || noteMutation.isPending || editor.hasPending} onClick={() => noteMutation.mutate()}>
              Guardar nota
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border bg-card/90 p-4 shadow-sm">
          <h3 className="flex items-center gap-2 font-black"><ClipboardList aria-hidden="true" className="h-5 w-5 text-primary" /> Notas</h3>
          {detail.notas?.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {detail.notas.map((note) => (
                <li key={note.id} className="rounded-lg border border-border bg-secondary/30 p-3 text-sm font-bold">
                  <p>{note.nota}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note.item_id ? `Artículo #${note.item_id}` : 'Factura'} · {note.usuario} · {formatDate(note.fecha, true)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm font-bold text-muted-foreground">Sin notas registradas.</p>}
        </Card>

        <Card className="border-border bg-card/90 p-4 shadow-sm">
          <h3 className="flex items-center gap-2 font-black"><ShieldCheck aria-hidden="true" className="h-5 w-5 text-primary" /> Bitácora</h3>
          {detail.bitacora?.length > 0 ? (
            <ol className="mt-3 space-y-2">
              {detail.bitacora.map((event) => (
                <li key={event.id} className="rounded-lg border border-border bg-secondary/30 p-3 text-sm font-bold">
                  <p>{event.campo}: <span className="font-mono">{event.valor_anterior ?? 'vacío'} → {event.valor_nuevo ?? 'vacío'}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{event.usuario} · {formatDate(event.fecha, true)}</p>
                </li>
              ))}
            </ol>
          ) : <p className="mt-3 text-sm font-bold text-muted-foreground">Sin movimientos registrados.</p>}
        </Card>
      </div>
    </section>
  )
}

export default function HistorialRecepciones() {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [folio, setFolio] = useState('')
  const [product, setProduct] = useState('')
  const [provider, setProvider] = useState('')
  const [state, setState] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [debouncedFolio] = useDebounce(folio, 400)
  const [debouncedProduct] = useDebounce(product, 400)

  useEffect(() => setPage(1), [debouncedFolio, debouncedProduct, provider, state, dateFrom, dateTo])

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(debouncedFolio.trim() ? { folio: debouncedFolio.trim() } : {}),
    ...(debouncedProduct.trim() ? { producto: debouncedProduct.trim() } : {}),
    ...(provider.trim() ? { proveedor: provider.trim() } : {}),
    ...(state ? { estado: state } : {}),
    ...(dateFrom ? { fecha_desde: dateFrom } : {}),
    ...(dateTo ? { fecha_hasta: dateTo } : {}),
  }), [dateFrom, dateTo, debouncedFolio, debouncedProduct, page, provider, state])

  const { data: history, isLoading, isFetching } = useQuery({
    queryKey: ['history_receptions', params],
    queryFn: async () => (await api.get('/api/historial-recepciones', { params })).data,
    placeholderData: (previous) => previous,
  })
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['history_reception_detail', selectedId],
    queryFn: async () => (await api.get(`/api/historial-recepciones/${selectedId}`)).data,
    enabled: Boolean(selectedId),
  })

  const pagination = history?.paginacion || { pagina: page, total: 0, totalPaginas: 1 }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5 pb-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><History aria-hidden="true" className="h-6 w-6" /></span>
            Historial de recepciones
          </h1>
          <p className="mt-2 text-sm font-bold text-muted-foreground">Consulta preservada, sin eliminación; edición y Excel solo para administración mientras esté pendiente.</p>
        </div>
        {isFetching && !isLoading && <p role="status" className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Actualizando resultados…</p>}
      </header>

      {selectedId ? (
        loadingDetail ? <LoadingState label="Cargando detalle del historial…" className="min-h-72" />
          : detail ? <HistoryDetail detail={detail} detailId={selectedId} onClose={() => setSelectedId(null)} />
            : <EmptyState icon={PackageSearch} title="No se pudo cargar el detalle" />
      ) : (
        <>
          <Card className="border-border bg-card/90 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Filter aria-hidden="true" className="h-5 w-5 text-primary" />
              <h2 className="font-black">Filtros del servidor</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <label className="text-xs font-black text-muted-foreground">
                Buscar folio
                <span className="relative mt-1 block">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <input value={folio} onChange={(event) => setFolio(event.target.value)} className="min-h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </span>
              </label>
              <label className="text-xs font-black text-muted-foreground">
                Buscar producto
                <input value={product} onChange={(event) => setProduct(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <label className="text-xs font-black text-muted-foreground">
                Proveedor
                <input value={provider} onChange={(event) => { setProvider(event.target.value); setPage(1) }} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <label className="text-xs font-black text-muted-foreground">
                Estado
                <select value={state} onChange={(event) => { setState(event.target.value); setPage(1) }} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {STATES.map((value) => <option key={value || 'todos'} value={value}>{value || 'Todos'}</option>)}
                </select>
              </label>
              <label className="text-xs font-black text-muted-foreground">
                Desde
                <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <label className="text-xs font-black text-muted-foreground">
                Hasta
                <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
            </div>
          </Card>

          <Card className="overflow-hidden border-border bg-card/90 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="flex items-center gap-2 font-black"><ClipboardList aria-hidden="true" className="h-5 w-5 text-primary" /> Resultados</h2>
                <p className="mt-1 text-xs font-bold text-muted-foreground">{pagination.total} recepciones · Página {pagination.pagina} de {pagination.totalPaginas}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="min-h-11 gap-2" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Anterior
                </Button>
                <Button type="button" variant="outline" className="min-h-11 gap-2" aria-label="Página siguiente" disabled={page >= pagination.totalPaginas} onClick={() => setPage((current) => current + 1)}>
                  Siguiente <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {isLoading ? <LoadingState label="Cargando historial…" className="min-h-64" /> : history?.data?.length > 0 ? (
              <div className="divide-y divide-border">
                {history.data.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    aria-label={`Abrir ${row.numero_remision}`}
                    onClick={() => setSelectedId(row.id)}
                    className="grid min-h-20 w-full gap-3 p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-mono text-sm font-black">{row.numero_remision}</p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">{row.items} artículos</p>
                    </div>
                    <p className="text-sm font-bold">{row.proveedor || 'MANUAL'}</p>
                    <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><CalendarDays aria-hidden="true" className="h-4 w-4" /> {formatDate(row.fecha_carga)}</p>
                    <span className={`justify-self-start rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider sm:justify-self-end ${stateStyles(row.estado)}`}>{row.estado}</span>
                  </button>
                ))}
              </div>
            ) : <EmptyState icon={CheckCircle2} title="Sin recepciones para estos filtros" className="min-h-64" />}
          </Card>
        </>
      )}
    </div>
  )
}
