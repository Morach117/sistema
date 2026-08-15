import { useQuery } from '@tanstack/react-query'
import axios from '@/lib/api'
import { readSession } from '@/auth/session'
import { canAccess } from '@/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Clock, Box, TrendingUp, AlertOctagon, ScanBarcode, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const user = readSession()?.user || {}
  const isAdmin = user.rol === 'admin'
  const canViewReclamaciones = canAccess(user, 'reclamaciones')

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await axios.get('/api/dashboard')
      return res.data
    },
    refetchInterval: 5000 // Polling every 5 seconds for real-time
  })

  // Para el empleado obtenemos las reclamaciones pendientes
  const { data: reclamaciones } = useQuery({
    queryKey: ['reclamaciones_list'],
    queryFn: async () => {
      const res = await axios.get('/api/reclamaciones')
      return res.data.data
    },
    enabled: canViewReclamaciones,
    refetchInterval: canViewReclamaciones ? 10000 : false,
  })

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div></div>
  if (error) return <div className="text-red-400 flex h-full items-center justify-center font-bold">Error al cargar dashboard</div>

  const kpis = data?.kpis || { pendientes: 0, finalizadas_hoy: 0, total_items: 0 }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Hola, {user.nombre || 'Usuario'}</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">
            {isAdmin ? 'Resumen general de operaciones' : 'Panel de Tareas y Alertas'}
          </p>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/50 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest text-slate-400">
          Rol: {isAdmin ? 'Administrador' : 'Empleado'}
        </div>
      </div>

      {isAdmin ? (
        // DASHBOARD ADMINISTRADOR
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="glass-panel hover:bg-slate-900/60 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-wider">Movimientos Pendientes</CardTitle>
                <Clock className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-100">{kpis.pendientes}</div>
                <p className="text-[10px] uppercase tracking-widest mt-2 text-amber-500 font-bold animate-pulse flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Requieren atención
                </p>
              </CardContent>
            </Card>
            
            <Card className="glass-panel hover:bg-slate-900/60 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-wider">Finalizadas Hoy</CardTitle>
                <Activity className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-emerald-400">{kpis.finalizadas_hoy}</div>
                <p className="text-[10px] uppercase tracking-widest mt-2 text-slate-500 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50"></span> Remisiones completadas
                </p>
              </CardContent>
            </Card>

            <Card className="glass-panel hover:bg-slate-900/60 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-wider">Volumen Histórico</CardTitle>
                <Box className="h-4 w-4 text-indigo-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-indigo-400">{kpis.total_items}</div>
                <p className="text-[10px] uppercase tracking-widest mt-2 text-slate-500 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50"></span> Items procesados
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="glass-panel border-t-4 border-t-indigo-500/50">
              <CardHeader className="border-b border-slate-800/60 bg-slate-900/20 pb-4">
              <CardTitle className="flex items-center gap-2 text-slate-200 font-black">
                <TrendingUp className="w-5 h-5 text-indigo-400" /> Actividad Reciente
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data?.activity?.length > 0 ? (
                <div className="divide-y divide-slate-800/60">
                  {data.activity.map((act, i) => (
                    <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
                      <div>
                        <p className="font-black text-slate-200 tracking-tight">{act.numero_remision}</p>
                        <p className="text-xs text-slate-500 font-medium">{new Date(act.fecha_carga).toLocaleString()}</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1.5">
                        <p className="text-sm font-black text-slate-300">{act.items} <span className="text-[10px] text-slate-500 uppercase tracking-widest">items</span></p>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border flex items-center gap-1.5 ${
                          act.estado === 'FINALIZADO' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                        }`}>
                          {act.estado === 'PENDIENTE' && <span className="w-1 h-1 rounded-full bg-amber-400"></span>}
                          {act.estado}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-slate-500 text-sm font-medium">No hay actividad reciente.</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Reclamaciones Admin */}
          <Card className="glass-panel border-t-4 border-t-red-500/50">
            <CardHeader className="border-b border-slate-800/60 bg-slate-900/20 pb-4">
              <CardTitle className="flex items-center gap-2 text-slate-200 font-black">
                <AlertOctagon className="w-5 h-5 text-red-500" /> Reclamaciones Pendientes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!canViewReclamaciones ? (
                <div className="p-8 text-center">
                  <p className="text-slate-500 text-sm font-bold">Reclamaciones no disponibles con tus permisos.</p>
                </div>
              ) : reclamaciones?.length > 0 ? (
                <div className="divide-y divide-slate-800/60 max-h-[300px] overflow-y-auto">
                  {reclamaciones.map(r => (
                    <Link to="/reclamaciones" key={r.id} className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors block">
                      <div>
                        <div className="font-black text-slate-200"># {r.numero_remision}</div>
                        <div className="text-xs text-slate-500 font-bold">{new Date(r.fecha_carga).toLocaleDateString()}</div>
                      </div>
                      <span className="bg-red-500 text-white font-black px-2.5 py-1 rounded-md text-xs shadow-lg shadow-red-500/20">
                        {r.items_pendientes} Items
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-3" />
                  <p className="text-slate-400 font-bold">Todo revisado, sin incidencias.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </>
      ) : (
        // DASHBOARD EMPLEADO
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <h2 className="text-xl font-black text-slate-200">Mis KPIs de Captura (Hoy)</h2>
            <div className="grid grid-cols-2 gap-4">
              <Card className="glass-panel border-indigo-500/30 bg-indigo-500/5">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Registros</p>
                  <div className="text-3xl font-black text-indigo-400">{data?.capturas_hoy?.count || 0}</div>
                </CardContent>
              </Card>
              <Card className="glass-panel border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Piezas</p>
                  <div className="text-3xl font-black text-emerald-400">{data?.capturas_hoy?.total_piezas || 0}</div>
                </CardContent>
              </Card>
            </div>

            <h2 className="text-xl font-black text-slate-200 pt-2">Accesos Rápidos</h2>
            <Link to="/captura" className="block p-6 glass-panel border-2 border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/5 hover:bg-indigo-500/10 transition-all rounded-2xl group">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/30 group-hover:scale-110 transition-transform">
                  <ScanBarcode className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-indigo-400 tracking-tight">Captura Rápida</h3>
                  <p className="text-sm font-bold text-slate-500 mt-1">Escanear y ajustar inventario</p>
                </div>
              </div>
            </Link>

            <Link to="/bodega" className="block p-6 glass-panel border-2 border-slate-700/50 hover:border-slate-600 bg-slate-900/50 hover:bg-slate-800 transition-all rounded-2xl group">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-slate-800 text-slate-300 rounded-xl group-hover:bg-slate-700 transition-colors">
                  <Box className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-300 tracking-tight">Bodega (Excel)</h3>
                  <p className="text-sm font-bold text-slate-500 mt-1">Exportación a SICAR</p>
                </div>
              </div>
            </Link>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-black text-slate-200">Alertas de Tareas</h2>
            
            <Card className="glass-panel border-slate-800/60">
              <CardHeader className="bg-slate-950/30 border-b border-slate-800/60 pb-4">
                <CardTitle className="text-base font-black flex items-center gap-2 text-slate-200">
                  <AlertOctagon className="w-5 h-5 text-red-500" /> Reclamaciones Pendientes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!canViewReclamaciones ? (
                  <div className="p-8 text-center">
                    <p className="text-slate-500 text-sm font-bold">Reclamaciones no disponibles con tus permisos.</p>
                  </div>
                ) : reclamaciones?.length > 0 ? (
                  <div className="divide-y divide-slate-800/60 max-h-[300px] overflow-y-auto">
                    {reclamaciones.map(r => (
                      <Link to="/reclamaciones" key={r.id} className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors block">
                        <div>
                          <div className="font-black text-slate-200"># {r.numero_remision}</div>
                          <div className="text-xs text-slate-500 font-bold">{new Date(r.fecha_carga).toLocaleDateString()}</div>
                        </div>
                        <span className="bg-red-500 text-white font-black px-2.5 py-1 rounded-md text-xs shadow-lg shadow-red-500/20">
                          {r.items_pendientes} Items
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center flex flex-col items-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-3" />
                    <p className="text-slate-400 font-bold">Todo revisado, sin incidencias.</p>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      )}
    </div>
  )
}
