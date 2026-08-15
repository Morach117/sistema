import { useState, useRef, useEffect } from 'react'
import axios from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScanBarcode, Trash2, CheckCircle2, Package, ArrowRightLeft } from 'lucide-react'
import Swal from 'sweetalert2'

export default function Traspasos() {
  const [listaProductos, setListaProductos] = useState([])
  const [search, setSearch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef(null)

  // Autofocus the scanner input on load
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const buscarProducto = async (e) => {
    e.preventDefault()
    if (!search.trim()) return

    setIsSearching(true)
    try {
      const { data } = await axios.get(`/api/traspasos/buscar?q=${encodeURIComponent(search.trim())}`)
      
      if (data.exacto) {
        agregarProducto(data.data)
        setSearch('')
      } else {
        Swal.fire({
          icon: 'info',
          title: 'Múltiples Resultados',
          text: `Se encontraron ${data.data.length} productos con un nombre similar. Usa el código de barras exacto.`,
          confirmButtonColor: '#4f46e5'
        })
      }
    } catch (err) {
      Swal.fire({ 
        toast: true, 
        position: 'top-end', 
        icon: 'error', 
        title: err.response?.data?.error || 'Producto no encontrado', 
        showConfirmButton: false, 
        timer: 1500 
      })
    } finally {
      setIsSearching(false)
      if (inputRef.current) inputRef.current.focus()
    }
  }

  const agregarProducto = (prod) => {
    setListaProductos(prev => {
      const index = prev.findIndex(p => p.id === prod.id)
      if (index > -1) {
        const newLista = [...prev]
        newLista[index].cantidad += 1
        return newLista
      }
      return [{ id: prod.id, codigo: prod.codigo, descripcion: prod.descripcion, cantidad: 1 }, ...prev]
    })
    
    Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'Agregado', showConfirmButton: false, timer: 800 })
  }

  const actualizarCantidad = (id, valor) => {
    let val = parseFloat(valor)
    if (isNaN(val) || val <= 0) val = 1
    
    setListaProductos(prev => prev.map(p => p.id === id ? { ...p, cantidad: val } : p))
  }

  const eliminarProducto = (id) => {
    setListaProductos(prev => prev.filter(p => p.id !== id))
  }

  const limpiarLista = () => {
    if (listaProductos.length === 0) return
    Swal.fire({
      title: '¿Limpiar lista?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Sí, borrar todo',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        setListaProductos([])
        if (inputRef.current) inputRef.current.focus()
      }
    })
  }

  const enviarTraspaso = async () => {
    if (listaProductos.length === 0) return
    
    setIsSubmitting(true)
    try {
      const payload = listaProductos.map(p => ({ id: p.id, cantidad: p.cantidad }))
      const { data } = await axios.post('/api/traspasos/guardar', { productos: payload })
      
      if (data.success) {
        Swal.fire({ icon: 'success', title: '¡Traspaso Exitoso!', text: data.message, timer: 2000, showConfirmButton: false })
        setListaProductos([])
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Fallo de conexión', 'error')
    } finally {
      setIsSubmitting(false)
      if (inputRef.current) inputRef.current.focus()
    }
  }

  const totalPiezas = listaProductos.reduce((sum, p) => sum + p.cantidad, 0)

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 text-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            Generar Traspaso
          </h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 ml-1">Salida de Mercancía</p>
        </div>
        <Button variant="destructive" className="gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 hover:text-red-300 font-bold shadow-none" onClick={limpiarLista} disabled={listaProductos.length === 0}>
          <Trash2 className="w-4 h-4" /> Limpiar Lista
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Scanner Area */}
          <Card className="glass-panel overflow-hidden relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <CardContent className="p-6 lg:p-8">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Escanea el Código de Barras</h2>
              <form onSubmit={buscarProducto} className="relative group">
                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                  {isSearching ? <span className="loading loading-spinner loading-sm text-indigo-500"></span> : <ScanBarcode className="w-6 h-6 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />}
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full h-16 pl-16 pr-4 bg-slate-950/50 border border-slate-700 rounded-2xl text-xl font-bold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-inner placeholder:text-slate-600"
                  placeholder="Ej. 880, 750... o Descripción"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={isSearching}
                />
              </form>
            </CardContent>
          </Card>

          {/* List Area */}
          <Card className="glass-panel flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Lista de Artículos</h3>
              <span className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-[10px] uppercase font-black border border-indigo-500/20 shadow-sm">
                {listaProductos.length} Productos
              </span>
            </div>
            <div className="flex-1 overflow-x-auto p-2">
              <table className="w-full text-left border-collapse">
                <thead className="text-slate-500 text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-4 border-b border-slate-800/60">Descripción / Código</th>
                    <th className="p-4 border-b border-slate-800/60 text-center w-40">Cantidad</th>
                    <th className="p-4 border-b border-slate-800/60 text-right w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {listaProductos.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-16 text-center text-slate-500">
                        <div className="w-16 h-16 mx-auto mb-4 bg-slate-800/50 rounded-2xl flex items-center justify-center border border-slate-700/50">
                            <ScanBarcode className="w-8 h-8 opacity-50" />
                        </div>
                        <span className="font-bold text-lg tracking-tight block text-slate-400">Escanea un producto para agregarlo</span>
                      </td>
                    </tr>
                  ) : (
                    listaProductos.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="p-4 align-middle">
                          <div className="font-black text-slate-200 text-base leading-snug tracking-tight mb-1.5">{item.descripcion}</div>
                          <span className="bg-slate-950/50 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded-md font-mono text-xs font-bold inline-flex items-center gap-1 shadow-inner">
                            <ScanBarcode className="w-3 h-3" /> {item.codigo}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-center">
                          <input 
                            type="number" 
                            step="any"
                            className="w-24 h-12 bg-slate-950/50 border border-indigo-500/30 text-indigo-400 rounded-xl px-2 text-center focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xl font-black transition-all shadow-inner"
                            min="0.1"
                            value={item.cantidad}
                            onChange={(e) => actualizarCantidad(item.id, e.target.value)}
                            onFocus={(e) => e.target.select()}
                          />
                        </td>
                        <td className="p-4 align-middle text-right">
                          <button onClick={() => eliminarProducto(item.id)} className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 w-10 h-10 rounded-xl flex items-center justify-center transition-all">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Sidebar Summary */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-8 self-start">
          <div className={`rounded-3xl p-8 shadow-inner text-center transition-colors relative overflow-hidden ${listaProductos.length > 0 ? 'bg-indigo-600' : 'bg-slate-900/40 border border-slate-800/60 backdrop-blur-md'}`}>
            <div className={`absolute top-0 left-0 w-full h-2 ${listaProductos.length > 0 ? 'bg-emerald-400' : 'bg-slate-800'}`}></div>
            <span className={`text-[10px] uppercase font-black tracking-widest block mb-2 ${listaProductos.length > 0 ? 'text-indigo-200' : 'text-slate-500'}`}>
              Total a Traspasar
            </span>
            <span className={`text-6xl font-black tracking-tighter drop-shadow-md block ${listaProductos.length > 0 ? 'text-white' : 'text-slate-300'}`}>
              {totalPiezas}
            </span>
            <span className={`text-xs font-bold block mt-2 ${listaProductos.length > 0 ? 'text-indigo-200' : 'text-slate-500'}`}>
              Piezas / Unidades
            </span>
          </div>

          <Button 
            className="w-full h-16 rounded-2xl font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95 bg-indigo-600 hover:bg-indigo-500 text-white text-lg gap-3 disabled:opacity-50"
            disabled={listaProductos.length === 0 || isSubmitting}
            onClick={enviarTraspaso}
          >
            {isSubmitting ? <span className="loading loading-spinner loading-md"></span> : <CheckCircle2 className="w-6 h-6" />}
            CONFIRMAR ORDEN
          </Button>
        </div>

      </div>
    </div>
  )
}
