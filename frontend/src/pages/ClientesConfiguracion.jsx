import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Network, RefreshCw, Search, Server, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const fieldClass = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70'
const labelClass = 'grid gap-1.5 text-sm font-bold'
const setupChoices = [
  { value: 'central', title: 'Esta será la Central', copy: 'Aquí se resguardan y comparten los clientes.' },
  { value: 'sucursal', title: 'Esta será una Sucursal', copy: 'Se vincula con un código temporal de la Central.' },
]

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback
}

export default function ClientesConfiguracion() {
  const queryClient = useQueryClient()
  const [nodeRole, setNodeRole] = useState('sucursal')
  const [nodeName, setNodeName] = useState('')
  const [visibleName, setVisibleName] = useState('')
  const [selectedCentralFingerprint, setSelectedCentralFingerprint] = useState('')
  const statusQuery = useQuery({
    queryKey: ['clientes-sync-estado'],
    queryFn: async () => (await api.get('/api/clientes-sync/estado')).data.data,
    retry: false,
    refetchInterval: (query) => {
      const currentStatus = query.state.data
      return currentStatus?.sucursal?.rol === 'sucursal' && !currentStatus?.centralVinculada ? 5000 : false
    },
  })
  const pair = useMutation({
    mutationFn: async ({ fingerprint }) => (await api.post('/api/clientes-sync/emparejar', {
      nombre_sucursal: statusQuery.data?.sucursal?.nombre,
      central_fingerprint: fingerprint,
      automatico: true,
    })).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes-sync-estado'] })
    },
  })
  const configure = useMutation({
    mutationFn: async ({ rol_nodo = nodeRole, nombre = nodeName } = {}) => (await api.put('/api/clientes-sync/configuracion', {
      rol_nodo,
      nombre: String(nombre || '').trim(),
    })).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes-sync-estado'] }),
  })

  const status = statusQuery.data
  const loadingStatus = statusQuery.isLoading && !status
  const missingIdentity = Number(statusQuery.error?.response?.status) === 409
    && /identidad LAN configurada/i.test(errorMessage(statusQuery.error, ''))
  const needsSetup = Boolean(status?.configuracionRequerida || missingIdentity)
  const canShowConfiguration = !statusQuery.error || missingIdentity
  const role = status?.sucursal?.rol || ''
  const linked = Boolean(status?.centralVinculada)
  const detectedCentrals = status?.centralesDetectadas ?? []
  const selectedCentral = detectedCentrals.find((central) => central.fingerprint === selectedCentralFingerprint)
  const linkBusy = pair.isPending

  const currentVisibleName = visibleName || status?.sucursal?.nombre || ''

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Administración local</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Configuración de clientes</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Identidad y vínculo LAN de esta instalación. Las direcciones de red se descubren automáticamente y nunca definen la identidad.</p>
      </header>

      {statusQuery.error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <p>{statusQuery.error?.response?.status === 404 ? 'El servicio local se está actualizando. Espera unos segundos y vuelve a intentarlo.' : errorMessage(statusQuery.error, 'No se pudo leer la configuración local.')}</p>
          <Button type="button" variant="outline" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching}>Reintentar</Button>
        </div>
      )}

      {loadingStatus && (
        <Card>
          <CardContent className="flex min-h-32 items-center gap-3 p-6 text-sm font-bold text-muted-foreground"><RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" />Leyendo la configuración de esta instalación…</CardContent>
        </Card>
      )}

      {!loadingStatus && canShowConfiguration && needsSetup && (
        <Card>
          <CardHeader><CardTitle>Inicializar esta instalación</CardTitle><CardDescription>Define el rol una sola vez. Después solo podrás cambiar el nombre visible.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {setupChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={nodeRole === choice.value}
                  onClick={() => setNodeRole(choice.value)}
                  className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${nodeRole === choice.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60'}`}
                >
                  <span className="block font-black">{choice.title}</span>
                  <span className="mt-1 block text-sm font-medium text-muted-foreground">{choice.copy}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className={labelClass}>Nombre visible<input className={fieldClass} value={nodeName} onChange={(event) => setNodeName(event.target.value)} placeholder="Ej. Sucursal Centro" /></label>
            <Button type="button" disabled={!nodeName.trim() || configure.isPending} onClick={() => configure.mutate()}>Guardar instalación</Button>
            </div>
          </CardContent>
          {configure.error && <p role="alert" className="px-6 pb-5 text-sm font-bold text-destructive">{errorMessage(configure.error, 'No se pudo inicializar.')}</p>}
        </Card>
      )}

      {!loadingStatus && canShowConfiguration && !needsSetup && <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server aria-hidden="true" className="h-5 w-5 text-primary" />Esta instalación</CardTitle>
            <CardDescription>Valores detectados en el servidor local.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className={labelClass}>
              Rol de esta instalación
              <select className={fieldClass} value={role} disabled>
                <option value="">Consultando…</option>
                <option value="central">Central</option>
                <option value="sucursal">Sucursal</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className={labelClass}>Nombre visible<input className={fieldClass} value={currentVisibleName} onChange={(event) => setVisibleName(event.target.value)} /></label>
              <Button type="button" variant="outline" disabled={!currentVisibleName.trim() || currentVisibleName.trim() === status?.sucursal?.nombre || configure.isPending} onClick={() => configure.mutate({ nombre: currentVisibleName, rol_nodo: role })}>Guardar nombre</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-muted/40 p-3"><p className="text-xs font-bold text-muted-foreground">Cola pendiente</p><p className="mt-1 text-2xl font-black">{status?.pendientes ?? '—'}</p></div>
              <div className="rounded-xl border border-border bg-muted/40 p-3"><p className="text-xs font-bold text-muted-foreground">Conflictos</p><p className="mt-1 text-2xl font-black">{status?.conflictos ?? '—'}</p></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Network aria-hidden="true" className="h-5 w-5 text-primary" />Vínculo LAN</CardTitle>
            <CardDescription>Busca y valida la central sin capturar una IP o hostname.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className={`flex items-start gap-3 rounded-xl border p-4 ${linked ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
              {linked ? <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0" /> : <WifiOff aria-hidden="true" className="h-5 w-5 shrink-0" />}
              <div><p className="font-black">{linked ? 'Identidad vinculada' : 'Sin vínculo activo'}</p><p className="mt-1 break-all text-xs text-muted-foreground">{status?.centralFingerprint || 'Aún no existe una huella de central verificada.'}</p></div>
            </div>

            {role === 'central' ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">Las sucursales de esta red pueden seleccionarte y vincularse directamente. La conexión quedará guardada en cada equipo.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                <section aria-labelledby="central-detectada-title" className="overflow-hidden rounded-2xl border border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-3 border-b border-primary/20 bg-primary/10 px-4 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                      {statusQuery.isFetching ? <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" /> : <Search aria-hidden="true" className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 id="central-detectada-title" className="font-black">1. Selecciona una Central detectada</h3>
                      <p className="text-xs text-muted-foreground">{statusQuery.isFetching ? 'Buscando equipos cercanos en la red local…' : 'Las Centrales disponibles aparecen automáticamente.'}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching}>
                      <RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${statusQuery.isFetching ? 'animate-spin' : ''}`} />Buscar
                    </Button>
                  </div>

                  {detectedCentrals.length > 0 ? (
                    <ul className="grid divide-y divide-primary/15" aria-label="Centrales detectadas en la red local">
                      {detectedCentrals.map((central) => {
                        const selected = selectedCentralFingerprint === central.fingerprint
                        return (
                          <li key={central.fingerprint}>
                            <label className={`flex min-h-20 cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors ${selected ? 'bg-primary/15' : 'hover:bg-primary/10'}`}>
                              <input
                                type="radio"
                                name="central-detectada"
                                value={central.fingerprint}
                                checked={selected}
                                disabled={linkBusy}
                                onChange={() => {
                                  setSelectedCentralFingerprint(central.fingerprint)
                                }}
                                className="sr-only"
                              />
                              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-primary'}`}>
                                <Server aria-hidden="true" className="h-5 w-5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block break-words font-black">{central.name}</span>
                                <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-muted-foreground"><Wifi aria-hidden="true" className="h-3.5 w-3.5" />Central disponible en tu red local</span>
                              </span>
                              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                                <ChevronRight aria-hidden="true" className="h-5 w-5" />
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="grid min-h-36 place-items-center gap-2 px-6 py-8 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-background text-muted-foreground"><WifiOff aria-hidden="true" className="h-6 w-6" /></span>
                      <p className="font-black">Aún no hay Centrales disponibles</p>
                      <p className="max-w-sm text-sm text-muted-foreground">Verifica que ambas instalaciones tengan el sistema iniciado, una identidad Central o Sucursal configurada y estén en la misma red local.</p>
                    </div>
                  )}
                </section>
                <Button type="button" onClick={() => pair.mutate({ fingerprint: selectedCentralFingerprint })} disabled={!selectedCentral || linkBusy}>
                  {pair.isPending ? <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight aria-hidden="true" className="mr-2 h-4 w-4" />}
                  Conectar con la Central seleccionada
                </Button>
                {pair.error && <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(pair.error, 'No se pudo vincular la sucursal.')}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>}
    </div>
  )
}
