import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, KeyRound, Network, RefreshCw, Server, ShieldCheck, WifiOff } from 'lucide-react'
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
  const [linkCode, setLinkCode] = useState('')
  const [nodeRole, setNodeRole] = useState('sucursal')
  const [nodeName, setNodeName] = useState('')
  const [foundCentral, setFoundCentral] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')
  const statusQuery = useQuery({
    queryKey: ['clientes-sync-estado'],
    queryFn: async () => (await api.get('/api/clientes-sync/estado')).data.data,
    retry: false,
  })
  const discover = useMutation({
    mutationFn: async () => (await api.post('/api/clientes-sync/descubrir', { codigo_vinculo: linkCode.trim() })).data.data,
    onSuccess: () => setFoundCentral(true),
  })
  const generateCode = useMutation({
    mutationFn: async () => (await api.post('/api/clientes-sync/codigo-vinculo')).data.data,
    onSuccess: (data) => setGeneratedCode(data.code),
  })
  const pair = useMutation({
    mutationFn: async () => (await api.post('/api/clientes-sync/emparejar', {
      codigo_vinculo: linkCode.trim(),
      nombre_sucursal: statusQuery.data?.sucursal?.nombre,
    })).data.data,
    onSuccess: () => {
      setFoundCentral(false)
      queryClient.invalidateQueries({ queryKey: ['clientes-sync-estado'] })
    },
  })
  const configure = useMutation({
    mutationFn: async () => (await api.put('/api/clientes-sync/configuracion', {
      rol_nodo: nodeRole,
      nombre: nodeName.trim(),
    })).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes-sync-estado'] }),
  })

  const status = statusQuery.data
  const needsSetup = !status || status.configuracionRequerida
  const role = status?.sucursal?.rol || ''
  const linked = Boolean(status?.centralVinculada)

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

      {needsSetup && (
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

      {!needsSetup && <div className="grid gap-6 lg:grid-cols-2">
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
            <label className={labelClass}>Nombre visible<input className={fieldClass} defaultValue={status?.sucursal?.nombre || ''} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== status?.sucursal?.nombre) configure.mutate({ nombre: event.target.value.trim(), rol_nodo: role }) }} /></label>
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
                <p className="text-sm text-muted-foreground">Genera un código temporal para autorizar una sucursal de la misma LAN.</p>
                <Button type="button" onClick={() => generateCode.mutate()} disabled={generateCode.isPending}><KeyRound aria-hidden="true" className="mr-2 h-4 w-4" />Generar código de vínculo</Button>
                {generatedCode && <output aria-label="Código de vínculo generado" className="rounded-xl border border-primary/30 bg-primary/5 p-4 font-mono text-sm font-black break-all">{generatedCode}</output>}
                {generateCode.error && <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(generateCode.error, 'No se pudo generar el código.')}</p>}
              </div>
            ) : (
              <div className="grid gap-3">
                <label className={labelClass}>Código de vínculo<textarea className={`${fieldClass} min-h-24 resize-y font-mono text-xs`} value={linkCode} onChange={(event) => { setLinkCode(event.target.value); setFoundCentral(false) }} required /></label>
                <Button type="button" variant="outline" onClick={() => discover.mutate()} disabled={!linkCode.trim() || discover.isPending}><RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${discover.isPending ? 'animate-spin' : ''}`} />Buscar central</Button>
                {foundCentral && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <p className="flex items-center gap-2 font-black"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />Central encontrada en la red local</p>
                    {!linked && <Button type="button" className="mt-3 w-full" onClick={() => pair.mutate()} disabled={pair.isPending}>Vincular sucursal</Button>}
                  </div>
                )}
                {discover.error && <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(discover.error, 'No se encontró una central válida en la LAN.')}</p>}
                {pair.error && <p role="alert" className="text-sm font-bold text-destructive">{errorMessage(pair.error, 'No se pudo vincular la sucursal.')}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>}
    </div>
  )
}
