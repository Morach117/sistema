import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BadgeDollarSign, CheckCircle2, CircleOff, Edit3, Plus, Search, UserRound, UserRoundX, UsersRound, WifiOff } from 'lucide-react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const fieldClass = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
const labelClass = 'grid gap-1.5 text-sm font-bold text-foreground'

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback
}

function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0))
}

function dateTime(value) {
  if (!value) return 'Fecha local'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-MX')
}

function StatusBanner({ status, isLoading, error }) {
  if (isLoading) {
    return <div role="status" aria-label="Estado de sincronización" className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Consultando sincronización local…</div>
  }
  if (error || !status) {
    return <div role="status" aria-label="Estado de sincronización" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-300">El estado de sincronización no está disponible. Los clientes siguen guardándose localmente.</div>
  }

  if (status.configuracionRequerida) {
    return (
      <div role="status" aria-label="Estado de sincronización" className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-black">Primero configura esta PC</p><p className="mt-1 text-sm text-muted-foreground">Indica si será la Central o una Sucursal antes de registrar clientes y vincular equipos.</p></div>
        <a href="/clientes-configuracion" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Configurar esta PC</a>
      </div>
    )
  }

  const offline = status.estado === 'offline'
  const title = {
    conectado: 'Sincronización activa',
    central: 'Central activa',
    offline: 'Sin conexión a central',
    'sin-vincular': 'Sucursal sin vincular',
  }[status.estado] || 'Estado local'
  const Icon = offline ? WifiOff : status.conflictos > 0 ? AlertTriangle : CheckCircle2

  return (
    <div role="status" aria-label="Estado de sincronización" className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${offline ? 'border-amber-500/30 bg-amber-500/10' : status.conflictos > 0 ? 'border-destructive/30 bg-destructive/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-black">{title}</p>
          <p className="text-sm text-muted-foreground">{offline ? 'Puedes seguir trabajando; los cambios se enviarán cuando vuelva la central.' : `Nodo local: ${status.sucursal?.nombre || 'Sin nombre'}`}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-black">
        <span className="rounded-full border border-current/20 bg-background/70 px-3 py-1.5">{status.pendientes} {status.pendientes === 1 ? 'cambio pendiente' : 'cambios pendientes'}</span>
        <span className="rounded-full border border-current/20 bg-background/70 px-3 py-1.5">{status.conflictos} {status.conflictos === 1 ? 'conflicto' : 'conflictos'}</span>
      </div>
    </div>
  )
}

function ClienteForm({ client, branchName, onCancel, onSubmit, pending, error }) {
  const editing = Boolean(client)
  const [values, setValues] = useState({ nombre: '', telefono: '', correo: '', notas: '' })

  useEffect(() => {
    setValues({ nombre: client?.nombre || '', telefono: client?.telefono || '', correo: client?.correo || '', notas: client?.notas || '' })
  }, [client])

  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    onSubmit(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])))
  }

  return (
    <Card className="border-primary/30 shadow-lg">
      <CardHeader>
        <CardTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</CardTitle>
        <CardDescription>Los datos se guardan primero en esta instalación.</CardDescription>
      </CardHeader>
      <CardContent>
        <form aria-label={editing ? 'Editar cliente' : 'Nuevo cliente'} onSubmit={submit} className="grid gap-4">
          <label className={labelClass}>Sucursal detectada<input className={`${fieldClass} bg-muted/50`} value={branchName || 'Configuración local'} readOnly /></label>
          <label className={labelClass}>Nombre<input className={fieldClass} value={values.nombre} onChange={update('nombre')} maxLength="180" required autoFocus /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Teléfono<input className={fieldClass} value={values.telefono} onChange={update('telefono')} maxLength="40" inputMode="tel" /></label>
            <label className={labelClass}>Correo<input className={fieldClass} value={values.correo} onChange={update('correo')} maxLength="254" type="email" /></label>
          </div>
          <label className={labelClass}>Notas<textarea className={`${fieldClass} min-h-24 resize-y`} value={values.notas} onChange={update('notas')} /></label>
          {error && <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(error, 'No se pudo guardar el cliente.')}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar cliente'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function VentaForm({ onCancel, onSubmit, pending, error }) {
  const [folio, setFolio] = useState('')
  const [total, setTotal] = useState('')
  const [detalle, setDetalle] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const payload = { total: Number(total) }
    if (folio.trim()) payload.folio_ticket = folio.trim()
    if (detalle.trim()) payload.detalle = { nota: detalle.trim() }
    onSubmit(payload)
  }

  return (
    <form aria-label="Registrar venta" onSubmit={submit} className="grid gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div><h3 className="font-black">Registrar venta</h3><p className="text-xs text-muted-foreground">El folio solo se valida si lo capturas.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Folio de ticket (opcional)<input className={fieldClass} value={folio} onChange={(event) => setFolio(event.target.value)} maxLength="100" /></label>
        <label className={labelClass}>Total<input className={fieldClass} value={total} onChange={(event) => setTotal(event.target.value)} min="0" step="0.01" type="number" required /></label>
      </div>
      <label className={labelClass}>Detalle opcional<textarea className={`${fieldClass} min-h-20`} value={detalle} onChange={(event) => setDetalle(event.target.value)} /></label>
      {error && <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(error, 'No se pudo registrar la venta.')}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar venta'}</Button>
      </div>
    </form>
  )
}

function ClienteDetail({ clientId, onEdit }) {
  const queryClient = useQueryClient()
  const [showSale, setShowSale] = useState(false)
  const detailQuery = useQuery({ queryKey: ['cliente', clientId], queryFn: async () => (await api.get(`/api/clientes/${clientId}`)).data.data, enabled: Boolean(clientId) })
  const purchasesQuery = useQuery({ queryKey: ['cliente-compras', clientId], queryFn: async () => (await api.get(`/api/clientes/${clientId}/compras`, { params: { pagina: 1, limite: 25 } })).data.data || [], enabled: Boolean(clientId) })
  const deactivate = useMutation({
    mutationFn: async () => (await api.post(`/api/clientes/${clientId}/desactivar`)).data.data,
    onSuccess: (updated) => {
      queryClient.setQueryData(['cliente', clientId], updated)
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      queryClient.invalidateQueries({ queryKey: ['clientes-sync-estado'] })
    },
  })
  const sale = useMutation({
    mutationFn: async (payload) => (await api.post(`/api/clientes/${clientId}/compras`, payload)).data.data,
    onSuccess: () => {
      setShowSale(false)
      queryClient.invalidateQueries({ queryKey: ['cliente-compras', clientId] })
      queryClient.invalidateQueries({ queryKey: ['clientes-sync-estado'] })
    },
  })

  if (detailQuery.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando ficha…</CardContent></Card>
  if (detailQuery.error) return <Card><CardContent className="p-6 text-sm font-bold text-destructive">{errorMessage(detailQuery.error, 'No se pudo abrir el cliente.')}</CardContent></Card>
  const client = detailQuery.data
  if (!client) return null

  const confirmDeactivation = () => {
    if (window.confirm(`¿Desactivar a ${client.nombre}? Sus compras se conservarán.`)) deactivate.mutate()
  }

  return (
    <section aria-label={`Ficha de ${client.nombre}`} className="grid gap-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><CardTitle className="truncate text-xl">{client.nombre}</CardTitle><CardDescription>{client.telefono || 'Sin teléfono'} · {client.correo || 'Sin correo'}</CardDescription></div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${client.activo ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{client.activo ? 'Cliente activo' : 'Cliente inactivo'}</span>
        </CardHeader>
        <CardContent className="grid gap-4">
          {client.notas && <p className="rounded-xl bg-muted/50 p-3 text-sm">{client.notas}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onEdit(client)}><Edit3 aria-hidden="true" className="mr-2 h-4 w-4" />Editar cliente</Button>
            <Button type="button" onClick={() => setShowSale(true)} disabled={!client.activo}><BadgeDollarSign aria-hidden="true" className="mr-2 h-4 w-4" />Registrar venta</Button>
            {client.activo && <Button type="button" variant="destructive" onClick={confirmDeactivation} disabled={deactivate.isPending}><UserRoundX aria-hidden="true" className="mr-2 h-4 w-4" />Desactivar cliente</Button>}
          </div>
          {deactivate.error && <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(deactivate.error, 'No se pudo desactivar.')}</p>}
        </CardContent>
      </Card>

      {showSale && <VentaForm onCancel={() => setShowSale(false)} onSubmit={sale.mutate} pending={sale.isPending} error={sale.error} />}

      <Card>
        <CardHeader><CardTitle className="text-base">Compras</CardTitle><CardDescription>Historial consolidado de esta ficha.</CardDescription></CardHeader>
        <CardContent>
          {purchasesQuery.isLoading ? <p className="text-sm text-muted-foreground">Cargando compras…</p> : purchasesQuery.error ? (
            <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(purchasesQuery.error, 'No se pudo cargar el historial de compras.')}</p>
          ) : purchasesQuery.data?.length ? (
            <ul className="divide-y divide-border">
              {purchasesQuery.data.map((purchase) => (
                <li key={purchase.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-bold">{purchase.folio_ticket || 'Sin folio'}</p><p className="text-xs text-muted-foreground">{dateTime(purchase.fecha_compra)}</p></div>
                  <p className="font-black tabular-nums">{money(purchase.total)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Este cliente aún no tiene compras.</p>}
        </CardContent>
      </Card>
    </section>
  )
}

export default function Clientes() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [formClient, setFormClient] = useState(undefined)
  const statusQuery = useQuery({ queryKey: ['clientes-sync-estado'], queryFn: async () => (await api.get('/api/clientes-sync/estado')).data.data, refetchInterval: 30_000 })
  const clientsQuery = useQuery({ queryKey: ['clientes', search], queryFn: async () => (await api.get('/api/clientes', { params: { pagina: 1, limite: 50, buscar: search, activo: 'todos' } })).data.data || [] })
  const saveClient = useMutation({
    mutationFn: async (payload) => formClient ? (await api.put(`/api/clientes/${formClient.id}`, payload)).data.data : (await api.post('/api/clientes', payload)).data.data,
    onSuccess: (saved) => {
      queryClient.setQueryData(['cliente', saved.id], saved)
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      queryClient.invalidateQueries({ queryKey: ['clientes-sync-estado'] })
      setSelectedId(saved.id)
      setFormClient(undefined)
    },
  })

  const openCreate = () => { saveClient.reset(); setFormClient(null) }
  const openEdit = (client) => { saveClient.reset(); setFormClient(client) }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Operación local</p><h1 className="mt-1 text-3xl font-black tracking-tight">Clientes</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Consulta fichas y registra ventas incluso cuando la central no está disponible.</p></div>
        {!clientsQuery.isLoading && !statusQuery.isLoading && !statusQuery.data?.configuracionRequerida && <Button type="button" size="lg" onClick={openCreate}><Plus aria-hidden="true" className="mr-2 h-5 w-5" />Nuevo cliente</Button>}
      </header>

      <StatusBanner status={statusQuery.data} isLoading={statusQuery.isLoading} error={statusQuery.error} />

      {formClient !== undefined && <ClienteForm client={formClient} branchName={statusQuery.data?.sucursal?.nombre} onCancel={() => setFormClient(undefined)} onSubmit={saveClient.mutate} pending={saveClient.isPending} error={saveClient.error} />}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.4fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader><CardTitle className="flex items-center gap-2"><UsersRound aria-hidden="true" className="h-5 w-5 text-primary" />Directorio</CardTitle><label className="relative mt-2 block"><span className="sr-only">Buscar clientes</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input className={`${fieldClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, teléfono o correo" /></label></CardHeader>
          <CardContent className="p-0">
            {clientsQuery.isLoading ? <p className="px-6 pb-6 text-sm text-muted-foreground">Cargando clientes…</p> : clientsQuery.error ? <p role="alert" className="px-6 pb-6 text-sm font-bold text-destructive">{errorMessage(clientsQuery.error, 'No se pudo cargar la lista.')}</p> : clientsQuery.data.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {clientsQuery.data.map((client) => (
                  <li key={client.id}>
                    <button type="button" aria-label={client.nombre} onClick={() => setSelectedId(client.id)} className={`flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedId === client.id ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-black">{client.nombre}</span><span className="block truncate text-xs text-muted-foreground">{client.telefono || client.correo || 'Sin contacto'}</span></span>
                      {!client.activo && <CircleOff aria-label="Inactivo" className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="px-6 pb-6 text-sm text-muted-foreground">No se encontraron clientes.</p>}
          </CardContent>
        </Card>

        {selectedId ? <ClienteDetail key={selectedId} clientId={selectedId} onEdit={openEdit} /> : <Card className="grid min-h-72 place-items-center border-dashed"><CardContent className="max-w-sm p-8 text-center"><UserRound aria-hidden="true" className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-black">Selecciona un cliente</p><p className="mt-1 text-sm text-muted-foreground">Aquí verás su ficha y sus compras.</p></CardContent></Card>}
      </div>
    </div>
  )
}
