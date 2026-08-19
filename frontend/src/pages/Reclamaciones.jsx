import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { canAccess } from '@/auth/permissions'
import { readSession } from '@/auth/session'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertOctagon, CheckCircle2, ShieldCheck, Check, Save } from 'lucide-react'
import Swal from 'sweetalert2'

export default function Reclamaciones() {
  const queryClient = useQueryClient()
  const [selectedIncidencia, setSelectedIncidencia] = useState(null)
  
  const session = readSession()
  const isAdmin = canAccess(session?.user, 'reclamaciones') && session.user.rol === 'admin'

  // Fetch list of incidencias
  const { data: incidencias, isLoading: loadingList } = useQuery({
    queryKey: ['reclamaciones_list'],
    queryFn: async () => {
      const res = await api.get('/api/reclamaciones')
      return res.data.data
    },
    refetchInterval: 10000 // Real-time
  })

  // Fetch details of selected incidencia
  const { data: items, isLoading: loadingDetails } = useQuery({
    queryKey: ['reclamaciones_detail', selectedIncidencia?.id],
    queryFn: async () => {
      if (!selectedIncidencia) return null
      const res = await api.get(`/api/reclamaciones/${selectedIncidencia.id}`)
      return res.data.items
    },
    enabled: !!selectedIncidencia
  })

  const guardarConteoMutation = useMutation({
    mutationFn: ({ id_item, nuevo_valor }) => api.post('/api/reclamaciones/recontar', { id_item, nuevo_valor }),
    onSuccess: () => {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Guardado', showConfirmButton: false, timer: 1500 })
      queryClient.invalidateQueries(['reclamaciones_detail', selectedIncidencia?.id])
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Error al guardar', 'error')
  })

  const validarItemMutation = useMutation({
    mutationFn: (id_item) => api.post('/api/reclamaciones/validar', { id_item }),
    onSuccess: () => {
      queryClient.invalidateQueries(['reclamaciones_detail', selectedIncidencia?.id])
      queryClient.invalidateQueries(['reclamaciones_list'])
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Error al validar', 'error')
  })

  const handleGuardar = (id_item) => {
    const input = document.getElementById(`inp_verify_${id_item}`)
    const nuevo_valor = parseFloat(input?.value)
    if (isNaN(nuevo_valor)) {
      Swal.fire({toast:true, position:'top', icon:'warning', title:'Escribe la cantidad', showConfirmButton:false, timer:1000})
      return
    }
    guardarConteoMutation.mutate({ id_item, nuevo_valor })
  }

  return (
    <div className="flex h-full gap-6 animate-in fade-in duration-500 pb-10">
      
      {/* Sidebar de Incidencias */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div>
          <h2 className="font-black text-2xl tracking-tight text-slate-100 flex items-center gap-2">
            <AlertOctagon className="text-red-500 w-6 h-6" /> Rectificación y re-conteo
          </h2>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 block">Artículos por rectificar</span>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {loadingList ? (
             [...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-2xl h-24 w-full"></div>
            ))
          ) : incidencias?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 opacity-40 text-slate-500">
              <ShieldCheck className="w-12 h-12 mb-2 text-emerald-500" />
              <span className="font-bold tracking-wide">Sin incidencias</span>
            </div>
          ) : (
            incidencias?.map((row) => (
              <div 
                key={row.id} 
                onClick={() => setSelectedIncidencia(row)}
                className={`glass-panel border shadow-sm hover:shadow-md cursor-pointer transition-all duration-300 rounded-2xl p-4 active:scale-95 group ${
                  selectedIncidencia?.id === row.id ? 'border-red-500 bg-red-500/10' : 'border-slate-800/60 bg-slate-900/40 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-black text-slate-200 text-base tracking-tight"># {row.numero_remision}</h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-500 text-white shadow-lg shadow-red-500/20">
                    {row.items_pendientes}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-bold">
                  {new Date(row.fecha_carga).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detalle Principal */}
      <div className="flex-1 flex flex-col glass-panel shadow-sm rounded-[2rem] overflow-hidden relative">
        {!selectedIncidencia ? (
           <div className="flex flex-col items-center justify-center h-full text-slate-600 mt-32">
             <AlertOctagon className="w-24 h-24 mb-6 opacity-30 text-red-500" />
             <p className="text-2xl font-black tracking-tight text-slate-500">Selecciona un folio</p>
           </div>
        ) : loadingDetails ? (
           <div className="flex flex-col items-center justify-center h-full">
             <span className="loading loading-spinner text-red-500 w-12 h-12"></span>
           </div>
        ) : items?.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-full animate-in fade-in">
             <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 mb-4">
               <Check className="w-10 h-10" />
             </div>
             <h2 className="text-2xl font-black tracking-tight text-slate-100">Incidencias Resueltas</h2>
           </div>
        ) : (
           <>
             {/* Header */}
             <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/50 flex justify-between items-center backdrop-blur-md">
                <div>
                  <h1 className="font-black text-2xl text-slate-100 leading-none tracking-tight flex items-center gap-3">
                    # {selectedIncidencia.numero_remision}
                    <span className="px-3 py-1 rounded-full text-[10px] uppercase font-black bg-red-500/10 text-red-400 border border-red-500/20 shadow-inner">Re-conteo Físico</span>
                  </h1>
                </div>
                {isAdmin && (
                  <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-black gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                    <CheckCircle2 className="w-4 h-4" /> Terminar
                  </Button>
                )}
             </div>
             
             {/* Lista de Items */}
             <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/20">
               {items?.map((item) => (
                 <Card key={item.id} className="glass-panel border-2 border-slate-800/50 bg-slate-900/40 shadow-sm transition-all overflow-hidden hover:border-slate-700 hover:bg-slate-900/60">
                   <div className="p-4 flex flex-col md:flex-row items-center gap-6">
                     
                     <div className="flex-1 w-full md:w-auto text-center md:text-left">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1.5">Verificar Cantidad</div>
                        <h3 className="font-black text-slate-200 text-lg leading-tight mb-2 tracking-tight">{item.descripcion_original}</h3>
                        <span className="bg-slate-950/50 text-slate-400 px-2 py-1 rounded-md font-mono text-xs font-bold border border-slate-700/50 shadow-inner">{item.codigo_proveedor}</span>
                     </div>
                     
                     <div className="flex items-stretch gap-3 justify-center w-full md:w-auto">
                        <div className="relative w-full md:w-48 border-2 border-slate-700 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/20 rounded-xl overflow-hidden shadow-inner bg-slate-950/50 transition-all">
                           <span className="absolute top-1 left-0 w-full text-center text-[8px] font-black text-slate-500 uppercase tracking-widest pointer-events-none drop-shadow-md">
                             CONTEO FÍSICO
                           </span>
                           <input 
                             type="number" 
                             id={`inp_verify_${item.id}`}
                             defaultValue={item.existencia_lapiz > 0 ? item.existencia_lapiz : ''}
                             placeholder="?"
                             className="w-full h-16 text-center font-black text-4xl text-indigo-400 focus:outline-none bg-transparent pt-3"
                             onKeyDown={(e) => { if (e.key === 'Enter') handleGuardar(item.id) }}
                           />
                        </div>
                        
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="w-16 h-16 border-2 border-slate-700 text-slate-400 bg-slate-950/30 hover:bg-indigo-600 hover:border-indigo-600 hover:text-white rounded-xl transition-all shadow-inner"
                          onClick={() => handleGuardar(item.id)}
                          title="Guardar Dato"
                        >
                           <Save className="w-6 h-6" />
                        </Button>
                        
                        {isAdmin && (
                          <div className="border-l-2 border-slate-800/60 pl-3 flex flex-col justify-center">
                            <Button 
                              size="icon" 
                              className="w-16 h-16 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
                              onClick={() => validarItemMutation.mutate(item.id)}
                              title="Aceptar Corrección"
                            >
                               <Check className="w-8 h-8 font-black" />
                            </Button>
                          </div>
                        )}
                     </div>

                   </div>
                 </Card>
               ))}
             </div>
           </>
        )}
      </div>
    </div>
  )
}
