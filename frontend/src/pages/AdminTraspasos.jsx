import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRightLeft, Search, Clock, FileSpreadsheet, Box, Loader2 } from 'lucide-react'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'

export default function AdminTraspasos() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [detallesFisicos, setDetallesFisicos] = useState({}) // { detalle_id: cantidad_recibida }

  const { data: traspasos, isLoading: loadingList } = useQuery({
    queryKey: ['admin_traspasos'],
    queryFn: async () => {
      const res = await axios.get('/api/traspasos/admin_list')
      return res.data.data
    },
    refetchInterval: 10000
  })

  const { data: detalles, isLoading: loadingDetails } = useQuery({
    queryKey: ['admin_traspasos_detalles', selectedId],
    queryFn: async () => {
      const res = await axios.get(`/api/traspasos/${selectedId}`)
      return res.data.data
    },
    enabled: !!selectedId
  })

  // Set default received amounts to sent amounts when details load
  useEffect(() => {
    if (detalles && selectedTraspaso?.estado === 'PENDIENTE') {
      const initial = {}
      detalles.forEach(d => {
        initial[d.detalle_id] = parseFloat(d.cantidad) || 0
      })
      setDetallesFisicos(initial)
    } else if (detalles && selectedTraspaso?.estado === 'COMPLETADO') {
       const initial = {}
      detalles.forEach(d => {
        initial[d.detalle_id] = parseFloat(d.cantidad) || 0
      })
      setDetallesFisicos(initial)
    }
  }, [detalles])

  const selectedTraspaso = traspasos?.find(t => t.id === selectedId)

  const completarMutation = useMutation({
    mutationFn: (payload) => axios.post('/api/traspasos/completar', payload),
    onSuccess: () => {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Traspaso Completado', showConfirmButton: false, timer: 2000 })
      queryClient.invalidateQueries(['admin_traspasos'])
      queryClient.invalidateQueries(['admin_traspasos_detalles', selectedId])
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Error al completar', 'error')
  })

  const handleCompletar = () => {
    const payloadDetalles = detalles.map(d => ({
      detalle_id: d.detalle_id,
      cantidad_recibida: detallesFisicos[d.detalle_id]
    }))

    Swal.fire({
      title: '¿Autorizar Traspaso?',
      text: "Se registrarán las cantidades físicas validadas.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      confirmButtonText: 'Sí, Completar'
    }).then((result) => {
      if (result.isConfirmed) {
        completarMutation.mutate({ id_traspaso: selectedId, detalles: payloadDetalles })
      }
    })
  }

  const exportarExcel = () => {
    if (!detalles || detalles.length === 0) return

    const exportData = detalles.map(d => ({
      'CLAVE SICAR': d.clave_sicar,
      'DESCRIPCIÓN': d.descripcion,
      'CANTIDAD RECIBIDA': detallesFisicos[d.detalle_id] || d.cantidad
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Traspaso")
    XLSX.writeFile(wb, `Traspaso_${selectedId}_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 pb-10 max-w-screen-2xl mx-auto w-full">
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          Auditoría de Traspasos
        </h1>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-2 ml-1">Recepción y Validación Física de Mercancía</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        
        {/* Lado Izquierdo: Lista de traspasos */}
        <div className="w-full lg:w-1/3 flex flex-col gap-4">
          <Card className="glass-panel border-slate-800/60 bg-slate-900/40 flex-1 flex flex-col min-h-0">
             <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-950/30 shrink-0 flex justify-between items-center">
                <span className="font-black text-slate-200 text-sm">Órdenes Activas</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded border border-slate-700">{traspasos?.length || 0}</span>
             </div>
             <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
                {loadingList ? (
                   [...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-800/50 animate-pulse rounded-xl"></div>)
                ) : traspasos?.length === 0 ? (
                   <div className="text-center py-10 text-slate-500 text-sm font-bold">No hay traspasos registrados.</div>
                ) : (
                   traspasos?.map(t => (
                     <div 
                        key={t.id} 
                        onClick={() => setSelectedId(t.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedId === t.id 
                            ? 'bg-blue-600/10 border-blue-500 shadow-sm shadow-blue-500/10 scale-[1.02]' 
                            : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/50'
                        }`}
                     >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-black text-slate-200 text-lg leading-none">#{t.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
                            t.estado === 'COMPLETADO' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {t.estado === 'PENDIENTE' ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            {t.estado}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex justify-between items-center mt-2">
                          <span>{new Date(t.fecha).toLocaleDateString()}</span>
                          <span>👤 {t.origen || 'Sistema'}</span>
                        </div>
                        <div className="mt-2 text-xs font-black text-slate-400 flex gap-3">
                          <span>📦 {t.total_piezas} PZ</span>
                          <span>#️⃣ {t.total_codigos} SKUs</span>
                        </div>
                     </div>
                   ))
                )}
             </div>
          </Card>
        </div>

        {/* Lado Derecho: Detalles */}
        <div className="w-full lg:w-2/3 flex flex-col">
          <Card className="glass-panel border-slate-800/60 bg-slate-900/40 flex-1 flex flex-col min-h-0 relative overflow-hidden">
            {!selectedId ? (
               <div className="flex flex-col items-center justify-center h-full text-slate-600">
                 <Search className="w-20 h-20 mb-6 opacity-30" />
                 <p className="text-xl font-black tracking-tight text-slate-500">Selecciona un traspaso para validarlo</p>
               </div>
            ) : loadingDetails ? (
               <div className="flex flex-col items-center justify-center h-full">
                 <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
               </div>
            ) : (
               <>
                 {/* Toolbar */}
                 <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-950/50 flex justify-between items-center shrink-0 backdrop-blur-md relative z-10">
                    <div>
                      <h2 className="font-black text-xl text-slate-100">Orden de Recepción #{selectedTraspaso?.id}</h2>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Verifique las cantidades recibidas físicamente</span>
                    </div>
                    
                    {selectedTraspaso?.estado === 'COMPLETADO' ? (
                       <Button onClick={exportarExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-500/20 gap-2">
                         <FileSpreadsheet className="w-4 h-4" /> Exportar a SICAR
                       </Button>
                    ) : (
                       <Button 
                         onClick={handleCompletar} 
                         disabled={completarMutation.isPending}
                         className="bg-blue-600 hover:bg-blue-500 text-white font-black shadow-lg shadow-blue-500/20 gap-2 active:scale-95"
                       >
                         {completarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                         Completar y Autorizar
                       </Button>
                    )}
                 </div>

                 {/* Table */}
                 <div className="flex-1 overflow-x-auto p-2">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-950/80 sticky top-0 z-10 text-slate-500 text-[10px] uppercase font-black tracking-widest backdrop-blur-md">
                        <tr>
                          <th className="p-4 border-b border-slate-800/60">Producto</th>
                          <th className="p-4 border-b border-slate-800/60 text-center">Cant. Enviada</th>
                          <th className="p-4 border-b border-slate-800/60 text-center bg-blue-500/5 text-blue-400">Cant. Recibida (Física)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                         {detalles?.map(d => {
                           const isCompleted = selectedTraspaso?.estado === 'COMPLETADO'
                           const dif = (detallesFisicos[d.detalle_id] || 0) - d.cantidad
                           
                           return (
                           <tr key={d.detalle_id} className={`hover:bg-slate-800/30 transition-colors ${isCompleted ? 'bg-emerald-900/5' : ''}`}>
                             <td className="p-4 align-middle">
                               <div className="font-black text-slate-200 text-sm leading-snug mb-1">{d.descripcion}</div>
                               <span className="bg-slate-950 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                                 SICAR: {d.clave_sicar}
                               </span>
                             </td>
                             <td className="p-4 align-middle text-center">
                               <span className="font-mono text-lg font-bold text-slate-400">{d.cantidad}</span>
                             </td>
                             <td className="p-4 align-middle bg-blue-500/5 w-48">
                               {isCompleted ? (
                                  <div className="flex flex-col items-center">
                                    <span className="font-mono text-2xl font-black text-emerald-400 drop-shadow-md">{d.cantidad}</span>
                                    <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Autorizado</span>
                                  </div>
                               ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <input 
                                      type="number"
                                      className="w-24 h-12 text-center text-xl font-black text-blue-400 bg-slate-950/50 border-2 border-blue-500/30 rounded-xl focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all shadow-inner"
                                      value={detallesFisicos[d.detalle_id] ?? d.cantidad}
                                      onChange={(e) => setDetallesFisicos({...detallesFisicos, [d.detalle_id]: parseFloat(e.target.value) || 0})}
                                      onFocus={e => e.target.select()}
                                    />
                                    {dif !== 0 && (
                                      <span className={`text-[9px] font-black uppercase tracking-widest ${dif > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {dif > 0 ? `+${dif} Sobrante` : `${dif} Faltante`}
                                      </span>
                                    )}
                                  </div>
                               )}
                             </td>
                           </tr>
                         )})}
                      </tbody>
                    </table>
                 </div>
               </>
            )}
          </Card>
        </div>

      </div>
    </div>
  )
}
