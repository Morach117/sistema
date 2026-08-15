import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import api from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PackageOpen, CheckCircle2, FileSpreadsheet, XCircle, Loader2, Upload, Trash2, X } from 'lucide-react'
import Swal from 'sweetalert2'

// ─────────────────────────────────────────────────
// SICAR Input with live catalog validation
// ─────────────────────────────────────────────────
function SicarInput({ item, onUpdate, esFaltante }) {
  const [value, setValue] = useState(item.clave_final || '')
  const [debouncedValue] = useDebounce(value, 600)
  const [description, setDescription] = useState('')
  const [isValidating, setIsValidating] = useState(false)

  useEffect(() => { setValue(item.clave_final || '') }, [item.clave_final])

  useEffect(() => {
    if (!debouncedValue || debouncedValue === 'FALTANTE' || debouncedValue === 'DEVOLUCION') {
      setDescription(''); return
    }
    let alive = true
    setIsValidating(true)
    api.get(`/api/catalogo/list?page=1&limit=1&search=${encodeURIComponent(debouncedValue)}`)
      .then(res => {
        if (!alive) return
        const r = res.data?.data?.[0]
        if (r && (
          (r.clave_sicar || '').toUpperCase() === debouncedValue.toUpperCase() || 
          (r.codigo_barras || '').toUpperCase() === debouncedValue.toUpperCase()
        )) {
          setDescription(r.descripcion)
        } else { setDescription('⚠ No encontrado en catálogo') }
      })
      .catch(() => { if (alive) setDescription('Error al validar') })
      .finally(() => { if (alive) setIsValidating(false) })
    return () => { alive = false }
  }, [debouncedValue])

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <span className="bg-slate-950/50 text-slate-400 border border-slate-700/50 px-2 py-1 rounded-md font-mono text-[10px] font-bold shadow-inner shrink-0">
          {item.cod_prov}
        </span>
        <div className="flex items-center border border-slate-700/50 rounded-md overflow-hidden bg-slate-950/50 shadow-inner h-7 flex-1 relative">
           <span className="bg-slate-800/80 text-slate-400 px-2 flex items-center h-full text-[8px] font-black uppercase tracking-widest border-r border-slate-700/50 shrink-0">SICAR</span>
           <input 
             type="text" 
             className={`w-full bg-transparent font-mono font-bold text-[11px] outline-none px-2 ${esFaltante ? 'text-red-400' : 'text-slate-200'}`}
             value={value}
             placeholder="---"
             onChange={(e) => { setValue(e.target.value); onUpdate(item.id, 'clave_final', e.target.value) }}
           />
           {value && !isValidating && (
             <button onClick={() => { setValue(''); onUpdate(item.id, 'clave_final', '') }} className="absolute right-2 text-slate-500 hover:text-red-400">
               <X className="w-3 h-3" />
             </button>
           )}
           {isValidating && <Loader2 className="w-3 h-3 text-slate-500 animate-spin absolute right-2 shrink-0" />}
        </div>
      </div>
      {description && !esFaltante && (
        <div className={`text-[9px] mt-1 font-bold tracking-wide px-1 truncate ${description.startsWith('⚠') ? 'text-amber-500' : 'text-emerald-400'}`}>
          {description}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────
const PROVEEDORES = [
  { value: 'custom', label: '🖐 Manual' },
  { value: 'paola', label: '📄 Paola/Oper.' },
  { value: 'tony', label: '🐯 Tony' },
  { value: 'optivosa', label: '👓 Optivosa' },
  { value: 'sindesc', label: '🚫 Sin Descuentos' },
]

// ─────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────
export default function Recepciones() {
  const queryClient = useQueryClient()
  const [selectedRemision, setSelectedRemision] = useState(null)
  const [globalDiscount, setGlobalDiscount] = useState(5)
  const [selectedProvider, setSelectedProvider] = useState('custom')
  const [showUploadModal, setShowUploadModal] = useState(false)

  // ── Queries ──
  const { data: remisiones, isLoading: isLoadingList } = useQuery({
    queryKey: ['recepciones_list'],
    queryFn: async () => { const res = await api.get('/api/recepciones'); return res.data.data },
    refetchInterval: 10000
  })

  const { data: remisionDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['recepciones_detail', selectedRemision],
    queryFn: async () => {
      if (!selectedRemision) return null
      const res = await api.get(`/api/recepciones/${selectedRemision}`)
      return res.data
    },
    enabled: !!selectedRemision
  })

  // Sync provider from DB when we load a remision
  useEffect(() => {
    if (remisionDetails?.proveedor) {
      const p = (remisionDetails.proveedor || '').toUpperCase()
      if (p.includes('PAOLA') || p.includes('OPERADORA')) setSelectedProvider('paola')
      else if (p.includes('TONY')) setSelectedProvider('tony')
      else if (p.includes('OPTIVOSA')) setSelectedProvider('optivosa')
      else if (p.includes('SINDESC')) setSelectedProvider('sindesc')
      else setSelectedProvider('custom')
    }
  }, [remisionDetails])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showUploadModal) {
          setShowUploadModal(false)
        } else if (selectedRemision) {
          setSelectedRemision(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showUploadModal, selectedRemision])

  // ── Mutations ──
  const updateFieldMutation = useMutation({
    mutationFn: ({ id_item, campo, valor }) => api.post('/api/recepciones/actualizar_campo', { id_item, campo, valor }),
    onSuccess: () => queryClient.invalidateQueries(['recepciones_detail', selectedRemision]),
    onError: (err) => Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: err.response?.data?.error || 'Error', showConfirmButton: false, timer: 1500 })
  })

  const deleteItemMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/recepciones/item/${id}`),
    onSuccess: () => {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Ítem eliminado', showConfirmButton: false, timer: 1500 })
      queryClient.invalidateQueries(['recepciones_detail', selectedRemision])
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Fallo al eliminar', 'error')
  })

  const finalizeMutation = useMutation({
    mutationFn: (numero_remision) => api.post('/api/recepciones/finalizar', { remision_id: numero_remision }),
    onSuccess: () => {
      Swal.fire('¡Finalizado!', 'La orden fue cerrada exitosamente.', 'success')
      setSelectedRemision(null)
      queryClient.invalidateQueries(['recepciones_list'])
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Fallo al finalizar', 'error')
  })

  const uploadMutation = useMutation({
    mutationFn: (formData) => api.post('/api/recepciones/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: (res) => {
      Swal.fire('¡Procesado!', res.data.mensaje || 'Archivos procesados', 'success')
      setShowUploadModal(false)
      queryClient.invalidateQueries(['recepciones_list'])
      if (res.data.id_remision) {
        setSelectedRemision(res.data.id_remision)
        queryClient.invalidateQueries(['recepciones_detail'])
      }
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Fallo al subir', 'error')
  })

  // ── Handlers ──
  const handleUpdate = (id_item, campo, valor) => updateFieldMutation.mutate({ id_item, campo, valor })

  const handleDelete = (id, desc) => {
    Swal.fire({
      title: '¿Eliminar ítem?',
      html: `<strong>${desc}</strong><br/><span class="text-sm text-gray-500">Se borrará permanentemente de la BD.</span>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Sí, Eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) deleteItemMutation.mutate(id)
    })
  }

  const handleFinalize = (numero_remision) => {
    Swal.fire({
      title: '¿Cerrar Inventario?', text: "Una vez finalizado no se podrá editar.",
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#10b981',
      confirmButtonText: 'Sí, Finalizar', cancelButtonText: 'Cancelar'
    }).then((result) => { if (result.isConfirmed) finalizeMutation.mutate(numero_remision) })
  }

  const handleValidarExcel = async (numero_remision) => {
    try {
      const response = await api.post(
        '/api/recepciones/generar_excel',
        { remision_id: numero_remision },
        { responseType: 'blob' },
      )
      const disposition = response.headers['content-disposition'] || ''
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i)
      const blobUrl = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filenameMatch?.[1] || `Carga_Sicar_${numero_remision}.xls`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo generar el archivo', 'error')
    }
  }

  const handleProviderChange = (val) => {
    setSelectedProvider(val)
    if (selectedRemision) {
      api.post('/api/recepciones/asignar_proveedor', { id_remision: selectedRemision, proveedor: val })
        .then(() => queryClient.invalidateQueries(['recepciones_detail', selectedRemision]))
    }
  }

  const handleUploadSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData()
    const files = e.target.querySelector('input[type="file"]').files
    if (!files.length) return Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Selecciona al menos un archivo', showConfirmButton: false, timer: 1500 })
    for (const f of files) formData.append('archivo_factura', f)
    uploadMutation.mutate(formData)
  }

  const fmtMoney = (n) => parseFloat(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

  // ── Computed ──
  const remisionCode = remisionDetails?.datos ? Object.keys(remisionDetails.datos)[0] : null
  const items = remisionCode ? remisionDetails.datos[remisionCode] : []
  const esFinalizada = remisionDetails?.estado === 'FINALIZADO'

  return (
    <div className="flex h-full gap-4 animate-in fade-in duration-500 pb-10">
      
      {/* ═══ Sidebar ═══ */}
      <div className="w-72 2xl:w-80 flex-shrink-0 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-black text-xl tracking-tight text-slate-100">Tareas</h2>
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Recepción Activa</span>
          </div>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black gap-1.5 h-8 px-3 shadow-lg shadow-indigo-500/20" onClick={() => setShowUploadModal(true)}>
            <Upload className="w-3.5 h-3.5" /> Subir XML
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
          {isLoadingList ? (
             [...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-slate-800/50 rounded-2xl h-20 w-full"></div>)
          ) : remisiones?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 opacity-40 text-slate-500">
              <CheckCircle2 className="w-12 h-12 mb-2" />
              <span className="font-bold tracking-wide">Todo al día</span>
            </div>
          ) : (
            remisiones?.map((row) => (
              <div 
                key={row.id} onClick={() => setSelectedRemision(row.id)}
                className={`glass-panel border-l-4 shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 rounded-xl p-3 active:scale-95 group ${
                  selectedRemision === row.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800/60 bg-slate-900/40 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <h3 className="font-black text-slate-200 text-sm tracking-tight">{row.numero_remision}</h3>
                  <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${row.estado === 'REVISION' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800/50 text-slate-400 border-slate-700'}`}>
                    {row.estado}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold">
                  <span>{new Date(row.fecha_carga).toLocaleDateString()}</span>
                  <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-widest text-slate-400 border border-slate-700/50">{row.items} items</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══ Main Panel ═══ */}
      <div className="flex-1 flex flex-col glass-panel shadow-sm rounded-2xl overflow-hidden relative min-w-0">
        {!selectedRemision ? (
           <div className="flex flex-col items-center justify-center h-full text-slate-600 mt-32">
             <PackageOpen className="w-20 h-20 mb-6 opacity-30" />
             <p className="text-xl font-black tracking-tight text-slate-500">Selecciona una tarea de la lista</p>
           </div>
        ) : isLoadingDetails ? (
           <div className="flex flex-col items-center justify-center h-full">
             <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
           </div>
        ) : remisionDetails?.datos ? (
           <>
             {/* ── Header Toolbar ── */}
             <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/50 flex flex-wrap gap-3 justify-between items-center backdrop-blur-md shrink-0">
                <div>
                  <h1 className="font-black text-lg text-slate-100 leading-none tracking-tight">Orden #{remisionCode}</h1>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 block">Auditoría de Inventario</span>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {/* Provider Selector */}
                  <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800/60 px-2 py-1 shadow-sm">
                    <span className="text-[8px] font-extrabold uppercase tracking-widest text-slate-500 mr-1.5">PROV</span>
                    <select value={selectedProvider} onChange={(e) => handleProviderChange(e.target.value)} className="bg-transparent font-bold text-slate-300 text-[11px] focus:outline-none cursor-pointer">
                      {PROVEEDORES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>

                  {/* Discount */}
                  <div className="flex items-center bg-purple-500/10 rounded-lg border border-purple-500/20 px-2 py-1 shadow-sm">
                    <span className="text-[8px] font-extrabold uppercase tracking-widest text-purple-400 mr-1">DTO %</span>
                    <input type="number" value={globalDiscount} onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)} className="w-8 bg-transparent font-black text-purple-400 text-xs focus:outline-none text-center" />
                  </div>

                  {!esFinalizada && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5 font-bold bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 shadow-inner text-[11px] h-8 px-3" onClick={() => handleValidarExcel(remisionCode)}>
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                      </Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-black gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-[11px] h-8 px-3" onClick={() => handleFinalize(remisionCode)}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Finalizar
                      </Button>
                    </>
                  )}
                </div>
             </div>
             
             {/* ── Items List ── */}
             <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/20 custom-scrollbar">
               {items?.map((item) => {
                 const esFaltante = item.clave_final === 'FALTANTE'
                 const esDevuelto = item.revision_pendiente == 2

                 // Cost calculations
                 let baseCost = parseFloat(item.costo_bruto || item.costo || 0)
                 const applyDisc = item.aplica_descuento_manual == 1
                 let costoFinal = baseCost
                 if (applyDisc) costoFinal *= (1 - (globalDiscount / 100))
                 const manualCosto = parseFloat(item.costo_unitario) || costoFinal
                 const costoSis = parseFloat(item.costo_sistema_actual) || 0
                 const ventaSis = parseFloat(item.precio_venta_sistema) || 0

                 return (
                 <Card key={item.id} className={`border ${esDevuelto ? 'border-red-500/50 bg-red-900/10' : esFaltante ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800/50 bg-slate-900/30'} shadow-sm transition-all overflow-hidden rounded-xl relative group`}>
                   
                   {/* Delete button (top-right corner) */}
                   {!esFinalizada && (
                     <button onClick={() => handleDelete(item.id, item.desc)} className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md bg-slate-800/80 text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-slate-700/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all" title="Eliminar ítem">
                       <Trash2 className="w-3 h-3" />
                     </button>
                   )}

                   <div className="p-3 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto_1fr] gap-3 items-center">
                     
                     {/* COL 1: Factura */}
                     <div className="flex lg:flex-col items-center gap-2 lg:gap-1 lg:border-r border-slate-700/50 lg:pr-3 lg:w-20">
                       <label className="text-[9px] text-slate-500 font-black tracking-widest shrink-0">FACTURA</label>
                       <input 
                         type="number" 
                         className="w-16 h-10 bg-slate-950/50 border border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg text-center font-black text-lg text-slate-200 outline-none transition-all shadow-inner"
                         defaultValue={item.cant}
                         disabled={esFinalizada}
                         onBlur={(e) => handleUpdate(item.id, 'cantidad', e.target.value)}
                       />
                     </div>

                     {/* COL 2: Description + SICAR */}
                     <div className="min-w-0">
                       <div className="font-black text-slate-200 text-[13px] leading-snug mb-2 tracking-tight truncate" title={item.desc}>{item.desc}</div>
                       <SicarInput item={item} onUpdate={handleUpdate} esFaltante={esFaltante} />
                     </div>
                     
                     {/* COL 3: Físico */}
                     <div className={`flex flex-col items-center bg-slate-950/50 shadow-inner p-2 rounded-xl border ${esFaltante ? 'border-amber-500/50' : 'border-slate-800/80'} w-20 mx-auto relative`}>
                       <span className={`text-[9px] font-black tracking-widest mb-0.5 ${esFaltante ? 'text-amber-500/70' : 'text-slate-500'}`}>FÍSICO</span>
                       <input 
                         type="number" 
                         className={`w-full bg-transparent text-center font-black text-xl focus:outline-none rounded ${esFaltante ? 'text-red-400' : 'text-indigo-400'}`}
                         defaultValue={item.existencia_lapiz || 0}
                         disabled={esFinalizada}
                         onBlur={(e) => handleUpdate(item.id, 'existencia_lapiz', e.target.value)}
                       />
                       <label className="absolute -bottom-2.5 bg-slate-800 border border-slate-700 shadow-md rounded-md px-1.5 py-0.5 flex items-center gap-1 cursor-pointer hover:border-red-500/50 transition-colors">
                         <input 
                           type="checkbox" className="w-2.5 h-2.5 accent-amber-500 rounded-sm"
                           checked={esFaltante} disabled={esFinalizada}
                           onChange={(e) => {
                             if(e.target.checked) { handleUpdate(item.id, 'clave_final', 'FALTANTE'); handleUpdate(item.id, 'existencia_lapiz', 0) }
                             else { handleUpdate(item.id, 'clave_final', '') }
                           }}
                         />
                         <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Faltante</span>
                       </label>
                     </div>
                     
                     {/* COL 4: Pricing Panel */}
                     <div className="flex flex-col gap-1.5 lg:border-l border-slate-800/60 lg:pl-3 min-w-0">
                       {/* Row 1: Checkbox + Reject */}
                       <div className="flex items-center gap-1.5">
                         <label className="cursor-pointer flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 transition-colors h-6 shrink-0">
                           <input type="checkbox" className="w-2.5 h-2.5 accent-purple-500 rounded-sm cursor-pointer"
                             checked={applyDisc} disabled={esFinalizada}
                             onChange={(e) => handleUpdate(item.id, 'aplica_descuento_manual', e.target.checked ? 1 : 0)}
                           />
                           <span className="font-extrabold text-[8px] text-purple-400 tracking-wider whitespace-nowrap">-{globalDiscount}% DTO</span>
                         </label>
                         <div className="flex-grow">
                           {!esFinalizada && !esDevuelto ? (
                             <button onClick={() => handleUpdate(item.id, 'revision_pendiente', 2)} className="w-full py-1 rounded-md border border-red-500/50 text-red-400 font-bold text-[9px] uppercase hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1 h-6">
                               <XCircle className="w-3 h-3" /> Rechazar
                             </button>
                           ) : esDevuelto ? (
                             <div className="w-full py-1 rounded-md bg-red-600 text-white font-black text-[9px] text-center uppercase tracking-widest h-6 flex items-center justify-center">REPORTADO</div>
                           ) : null}
                         </div>
                       </div>

                       {/* Row 2: Cost + Margins */}
                       <div className="flex gap-1.5 h-[4.5rem]">
                         {/* Cost Final */}
                         <div className="bg-slate-900/50 p-1.5 rounded-lg border border-slate-800/60 flex flex-col items-center justify-center w-1/2 min-w-0">
                           <span className="text-[8px] font-black tracking-widest text-slate-500">COSTO FINAL</span>
                           <div className="flex items-center gap-0.5 mt-0.5 w-full justify-center">
                             <span className="text-slate-500 font-black text-[10px]">$</span>
                             <input type="number" step="0.01"
                               className="w-full bg-transparent p-0 text-sm font-black text-slate-200 text-center leading-none focus:outline-none focus:text-indigo-400 transition-colors"
                               defaultValue={manualCosto.toFixed(2)}
                               disabled={esFinalizada}
                               onBlur={(e) => handleUpdate(item.id, 'costo_unitario', e.target.value)}
                             />
                           </div>
                           {costoSis > 0 ? (
                             <span className="text-[8px] text-orange-400 font-bold bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 truncate w-full text-center mt-0.5">Ant: {fmtMoney(costoSis)}</span>
                           ) : (
                             <span className="text-[8px] bg-slate-800 text-slate-400 font-bold text-center rounded py-0.5 w-full uppercase tracking-widest mt-0.5">Nuevo</span>
                           )}
                         </div>

                         {/* VTA + Margins */}
                         <div className="w-1/2 flex flex-col justify-between min-w-0">
                           {ventaSis > 0 ? (
                             <div className="bg-amber-500/10 text-amber-400 text-[9px] font-black text-center rounded-md py-0.5 border border-amber-500/20 shadow-sm truncate">VTA: {fmtMoney(ventaSis)}</div>
                           ) : (
                             <div className="text-center text-slate-500 text-[8px] font-bold uppercase tracking-widest">Sin precio Vta</div>
                           )}
                           <div className="grid grid-cols-2 gap-1 mt-auto">
                             <div className="bg-blue-900/20 rounded-md border border-blue-500/20 flex flex-col items-center justify-center py-0.5">
                               <div className="text-[7px] font-extrabold text-blue-400">20%</div>
                               <div className="font-black text-blue-400 text-[10px]">{fmtMoney(manualCosto * 1.20)}</div>
                             </div>
                             <div className="bg-emerald-900/20 rounded-md border border-emerald-500/20 flex flex-col items-center justify-center py-0.5">
                               <div className="text-[7px] font-extrabold text-emerald-400">30%</div>
                               <div className="font-black text-emerald-400 text-[10px]">{fmtMoney(manualCosto * 1.30)}</div>
                             </div>
                           </div>
                         </div>
                       </div>
                     </div>

                   </div>
                 </Card>
               )})}
             </div>
           </>
        ) : null}
      </div>

      {/* ═══ Upload Modal ═══ */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowUploadModal(false)}>
          <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-xl text-slate-100 tracking-tight mb-1">Cargar XML / CSV</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-6">Sube facturas para crear nuevas tareas</p>
            <form onSubmit={handleUploadSubmit}>
              <input
                type="file" multiple accept=".csv,.xml"
                className="w-full bg-slate-950/50 border-2 border-dashed border-slate-700 rounded-xl px-4 py-6 text-slate-400 text-sm font-bold cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:text-xs file:cursor-pointer hover:border-indigo-500/50 transition-colors"
              />
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="outline" className="flex-1 bg-slate-800 border-slate-700 text-slate-300 font-bold" onClick={() => setShowUploadModal(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-lg shadow-indigo-500/20" disabled={uploadMutation.isPending}>
                  {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Procesar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
