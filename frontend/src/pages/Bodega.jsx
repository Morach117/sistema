import { useState, useRef, useEffect } from 'react'
import axios from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Box, Save, Barcode, FileSpreadsheet, Search, Database, X, Clock } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export default function Bodega() {
  const [capturedItems, setCapturedItems] = useState([])
  const [scanInput, setScanInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('captura') // 'captura' or 'inventario'
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItems, setSelectedItems] = useState(new Map())
  const [historialProducto, setHistorialProducto] = useState(null)
  
  // Modo Salida States
  const [salidaItems, setSalidaItems] = useState([])
  const [scanSalidaInput, setScanSalidaInput] = useState('')
  const salidaInputRef = useRef(null)
  
  // Bajar Modal States
  const [showBajarModal, setShowBajarModal] = useState(false)
  const [bajarItems, setBajarItems] = useState([])
  const [isBajarSaving, setIsBajarSaving] = useState(false)

  // Scanner Quantity Modal State
  const [scannedItemPendingQuantity, setScannedItemPendingQuantity] = useState(null)

  const inputRef = useRef(null)
  const queryClient = useQueryClient()

  const { data: inventarioGlobal, isLoading: isLoadingInv } = useQuery({
    queryKey: ['bodega_inventario', searchTerm],
    queryFn: async () => {
      const res = await axios.get(`/api/bodega?q=${encodeURIComponent(searchTerm)}`)
      return res.data
    },
    enabled: activeTab === 'inventario'
  })

  const { data: historialData, isLoading: isLoadingHistorial } = useQuery({
    queryKey: ['bodega_historial', historialProducto?.clave_sicar],
    queryFn: async () => {
      const res = await axios.get(`/api/bodega/${encodeURIComponent(historialProducto.clave_sicar)}/historial`)
      return res.data.data
    },
    enabled: !!historialProducto
  })

  useEffect(() => {
    if (activeTab === 'captura') inputRef.current?.focus()
    if (activeTab === 'salida') salidaInputRef.current?.focus()
  }, [activeTab])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (historialProducto) {
          setHistorialProducto(null)
        } else if (showBajarModal) {
          setShowBajarModal(false)
        } else if (scannedItemPendingQuantity) {
          setScannedItemPendingQuantity(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historialProducto, showBajarModal, scannedItemPendingQuantity])

  const handleScan = async (e) => {
    e.preventDefault()
    if (!scanInput.trim()) return

    const clave = scanInput.trim()
    setScanInput('') 

    const existingIndex = capturedItems.findIndex(item => item.clave_sicar === clave)
    if (existingIndex >= 0) {
      setScannedItemPendingQuantity({
         product: capturedItems[existingIndex],
         mode: 'captura',
         isNew: false
      })
      return
    }

    try {
      const res = await axios.get(`/api/bodega/buscar/${clave}`)
      const product = res.data
      
      setScannedItemPendingQuantity({
         product,
         mode: 'captura',
         isNew: true
      })
    } catch (error) {
      toast.error('Producto no encontrado en el Catálogo Maestro', {
        description: `Clave: ${clave}`
      })
    }
  }

  const handleSalidaScan = async (e) => {
    e.preventDefault()
    if (!scanSalidaInput.trim()) return

    const clave = scanSalidaInput.trim()
    setScanSalidaInput('') 

    const existingIndex = salidaItems.findIndex(item => item.clave_sicar === clave)
    if (existingIndex >= 0) {
      setScannedItemPendingQuantity({
         product: salidaItems[existingIndex],
         mode: 'salida',
         isNew: false
      })
      return
    }

    try {
      const res = await axios.get(`/api/bodega/buscar/${clave}`)
      const product = res.data
      
      if (product.existencia <= 0) {
         toast.error('Este producto no tiene existencia en bodega')
         return
      }
      
      setScannedItemPendingQuantity({
         product,
         mode: 'salida',
         isNew: true
      })
    } catch (error) {
      toast.error('Producto no encontrado en Bodega', {
        description: `Clave: ${clave}`
      })
    }
  }

  const handleQuantityChange = (clave, newQuantity) => {
    setCapturedItems(prev => prev.map(item => 
      item.clave_sicar === clave ? { ...item, cantidad: newQuantity } : item
    ))
  }

  const handleUbicacionChange = (clave, newUbicacion) => {
    setCapturedItems(prev => prev.map(item => 
      item.clave_sicar === clave ? { ...item, ubicacion: newUbicacion } : item
    ))
  }

  const removeItem = (clave) => {
    setCapturedItems(prev => prev.filter(item => item.clave_sicar !== clave))
  }

  const handleSave = async () => {
    if (capturedItems.length === 0) return

    setIsSaving(true)
    try {
      await axios.post('/api/bodega/guardar-lote', { movimientos: capturedItems })
      toast.success('Inventario guardado con éxito')
      setCapturedItems([])
    } catch (error) {
      toast.error('Error al guardar inventario', {
        description: error.response?.data?.error || error.message
      })
    } finally {
      setIsSaving(false)
      inputRef.current?.focus()
    }
  }

  const handleExportExcel = () => {
    if (capturedItems.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }

    // SICAR exact format: Clave, Existencia
    const exportData = capturedItems.map(item => ({
      'Clave': item.clave_sicar,
      'Existencia': Number(item.cantidad) || 0
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "InventarioBodega")
    
    // Generate filename with current date
    const dateStr = new Date().toISOString().slice(0,10)
    XLSX.writeFile(wb, `Inventario_Bodega_${dateStr}.xlsx`)
    toast.success('Excel generado correctamente')
  }

  const handleExportExcelGlobal = () => {
    if (!inventarioGlobal || inventarioGlobal.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }

    let itemsToExport = inventarioGlobal
    if (selectedItems.size > 0) {
      itemsToExport = Array.from(selectedItems.values())
    }

    const exportData = itemsToExport.map(item => ({
      'Clave': item.clave_sicar,
      'Existencia': Number(item.existencia) || 0
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "InventarioCompleto")
    
    const dateStr = new Date().toISOString().slice(0,10)
    XLSX.writeFile(wb, `Inventario_Bodega_${dateStr}.xlsx`)
    toast.success(selectedItems.size > 0 ? 'Datos seleccionados exportados' : 'Todos los datos exportados')
  }

  const toggleSelection = (item) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      if (newMap.has(item.clave_sicar)) newMap.delete(item.clave_sicar)
      else newMap.set(item.clave_sicar, item)
      return newMap
    })
  }

  const toggleAllSelection = () => {
    if (selectedItems.size === inventarioGlobal?.length && inventarioGlobal?.length > 0) {
      setSelectedItems(new Map())
    } else {
      const newMap = new Map()
      inventarioGlobal?.forEach(i => newMap.set(i.clave_sicar, i))
      setSelectedItems(newMap)
    }
  }

  const handleDeleteBodega = async (clave) => {
    try {
      await axios.post('/api/bodega/eliminar', { clave_sicar: clave })
      toast.success('Producto eliminado de la bodega')
      // Refetch
      queryClient.invalidateQueries({ queryKey: ['bodega_inventario'] })
    } catch (error) {
      toast.error('Error al eliminar', {
        description: error.response?.data?.error || error.message
      })
    }
  }

  const handleOpenBajarModal = () => {
    if (selectedItems.size === 0) return
    const items = Array.from(selectedItems.values()).map(item => ({
        ...item,
        cantidad_bajar: 1, // Default 1
        notas: ''
      }))
    setBajarItems(items)
    setShowBajarModal(true)
  }

  const handleExportBajarExcel = (items) => {
    if (!items || items.length === 0) return

    // SICAR exact format: Clave, Existencia (Calculated as current - subtracted)
    const exportData = items.map(item => ({
      'Clave': item.clave_sicar,
      'Existencia': Number(item.existencia) - Number(item.cantidad_bajar)
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "SalidaBodega")
    
    const dateStr = new Date().toISOString().slice(0,10)
    XLSX.writeFile(wb, `Salida_Bodega_${dateStr}.xlsx`)
  }

  const handleBajarSubmit = async () => {
    // Validate quantities
    const invalidItems = bajarItems.filter(item => Number(item.cantidad_bajar) > Number(item.existencia) || Number(item.cantidad_bajar) <= 0)
    if (invalidItems.length > 0) {
      toast.error('Cantidades inválidas. Verifique que no superen la existencia física.')
      return
    }

    setIsBajarSaving(true)
    try {
      await axios.post('/api/bodega/bajar-lote', { movimientos: bajarItems })
      toast.success('Inventario reducido correctamente')
      
      // Generar Excel con las cantidades seleccionadas
      handleExportBajarExcel(bajarItems)
      
      setShowBajarModal(false)
      setSelectedItems(new Map())
      queryClient.invalidateQueries({ queryKey: ['bodega_inventario'] })
    } catch (error) {
      toast.error('Error al bajar inventario', {
        description: error.response?.data?.error || error.message
      })
    } finally {
      setIsBajarSaving(false)
    }
  }

  const updateBajarItem = (clave, field, value) => {
    setBajarItems(prev => prev.map(item => 
      item.clave_sicar === clave ? { ...item, [field]: value } : item
    ))
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
            <Box className="w-8 h-8 text-indigo-500" />
            Bodega / Inventario
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Gestión de existencias en almacén</p>
        </div>
        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800/60 shadow-inner">
          <button
            onClick={() => setActiveTab('captura')}
            className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${
              activeTab === 'captura' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Modo Captura
          </button>
          <button
            onClick={() => setActiveTab('salida')}
            className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${
              activeTab === 'salida' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Modo Salida (Bajar)
          </button>
          <button
            onClick={() => setActiveTab('inventario')}
            className={`px-4 py-2 rounded-lg text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'inventario' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Database className="w-4 h-4" /> Consultar Bodega
          </button>
        </div>
      </div>

      {activeTab === 'captura' ? (
        <>
          <div className="flex justify-end gap-3">
            <Button 
              onClick={handleExportExcel} 
              disabled={capturedItems.length === 0}
              variant="outline"
              className="gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 transition-all font-bold active:scale-95 px-4"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Generar Excel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={capturedItems.length === 0 || isSaving}
              className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all font-bold active:scale-95 px-6"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Confirmar Movimiento'}
            </Button>
          </div>

          <Card className="glass-panel border-dashed border-2 border-slate-700/50 bg-slate-900/20">
        <CardContent className="p-6">
          <form onSubmit={handleScan} className="flex gap-4">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                autoFocus
                type="text"
                className="w-full pl-12 pr-4 py-4 text-lg font-mono border border-slate-800 bg-slate-950/50 text-slate-200 placeholder-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-inner"
                placeholder="Escanee código de barras o escriba clave y presione Enter..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
              />
              <Barcode className="absolute left-4 top-4 w-6 h-6 text-slate-500" />
            </div>
            <Button type="submit" size="lg" className="h-[60px] px-8 rounded-xl font-black tracking-wide bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">
              Agregar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-panel overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800/60 text-slate-500 uppercase tracking-widest text-[10px] font-black">
                <tr>
                  <th className="px-6 py-4">Clave SICAR</th>
                  <th className="px-6 py-4">Descripción</th>
                  <th className="px-6 py-4 text-center">Cant. Anterior</th>
                  <th className="px-6 py-4 text-center">Nueva Cantidad</th>
                  <th className="px-6 py-4">Ubicación</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {capturedItems.length > 0 ? (
                  capturedItems.map((item) => (
                    <tr key={item.clave_sicar} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-black text-slate-200">{item.clave_sicar}</td>
                      <td className="px-6 py-4 font-medium text-slate-400">{item.descripcion || 'N/A'}</td>
                      <td className="px-6 py-4 text-center font-bold text-slate-500">{item.existencia}</td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          className="w-24 px-2 py-1.5 text-center font-bold border border-slate-700 rounded-lg bg-slate-950/50 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-inner"
                          value={item.cantidad}
                          onChange={(e) => handleQuantityChange(item.clave_sicar, e.target.value)}
                        />
                      </td>
                      <td className="px-6 py-4">
                         <input
                          type="text"
                          className="w-full px-3 py-1.5 font-medium border border-slate-700 rounded-lg bg-slate-950/50 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm shadow-inner"
                          value={item.ubicacion}
                          onChange={(e) => handleUbicacionChange(item.clave_sicar, e.target.value)}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl" 
                          onClick={() => removeItem(item.clave_sicar)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-24 text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-700/50">
                          <Box className="w-8 h-8 text-slate-600" />
                        </div>
                        <p className="text-lg font-black text-slate-300 tracking-tight">No hay productos capturados</p>
                        <p className="text-[10px] uppercase tracking-widest font-bold mt-2">Comience a escanear para agregar productos a la lista</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </>
      ) : activeTab === 'salida' ? (
        <>
          <div className="flex justify-end gap-3">
            <Button 
              onClick={() => handleExportBajarExcel(salidaItems)} 
              disabled={salidaItems.length === 0}
              variant="outline"
              className="gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 transition-all font-bold active:scale-95 px-4"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Solo Generar Excel
            </Button>
            <Button 
              onClick={async () => {
                 setIsBajarSaving(true)
                 try {
                   await axios.post('/api/bodega/bajar-lote', { movimientos: salidaItems })
                   toast.success('Inventario reducido correctamente')
                   handleExportBajarExcel(salidaItems)
                   setSalidaItems([])
                   queryClient.invalidateQueries({ queryKey: ['bodega_inventario'] })
                 } catch (error) {
                   toast.error('Error al bajar inventario', {
                     description: error.response?.data?.error || error.message
                   })
                 } finally {
                   setIsBajarSaving(false)
                   salidaInputRef.current?.focus()
                 }
              }} 
              disabled={salidaItems.length === 0 || isBajarSaving}
              className="gap-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-lg shadow-rose-500/20 transition-all font-bold active:scale-95 px-6"
            >
              <Save className="w-4 h-4" />
              {isBajarSaving ? 'Procesando...' : 'Confirmar Salida y Generar Excel'}
            </Button>
          </div>

          <Card className="glass-panel border-dashed border-2 border-slate-700/50 bg-slate-900/20">
        <CardContent className="p-6">
          <form onSubmit={handleSalidaScan} className="flex gap-4">
            <div className="relative flex-1">
              <input
                ref={salidaInputRef}
                autoFocus
                type="text"
                className="w-full pl-12 pr-4 py-4 text-lg font-mono border border-slate-800 bg-slate-950/50 text-slate-200 placeholder-slate-600 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all shadow-inner"
                placeholder="Escanee código de barras para BAJAR de bodega..."
                value={scanSalidaInput}
                onChange={(e) => setScanSalidaInput(e.target.value)}
              />
              <Barcode className="absolute left-4 top-4 w-6 h-6 text-slate-500" />
            </div>
            <Button type="submit" size="lg" className="h-[60px] px-8 rounded-xl font-black tracking-wide bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors">
              Bajar Producto
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-panel overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800/60 text-slate-500 uppercase tracking-widest text-[10px] font-black">
                <tr>
                  <th className="px-6 py-4">Clave SICAR</th>
                  <th className="px-6 py-4">Descripción</th>
                  <th className="px-6 py-4 text-center">Existencia</th>
                  <th className="px-6 py-4 text-center">Cant. a Bajar</th>
                  <th className="px-6 py-4">Notas (Opcional)</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {salidaItems.length > 0 ? (
                  salidaItems.map((item) => (
                    <tr key={item.clave_sicar} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-black text-slate-200">{item.clave_sicar}</td>
                      <td className="px-6 py-4 font-medium text-slate-400">{item.descripcion || 'N/A'}</td>
                      <td className="px-6 py-4 text-center font-bold text-slate-500">{item.existencia}</td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min="1"
                          max={item.existencia}
                          className="w-24 px-2 py-1.5 text-center font-bold border border-slate-700 rounded-lg bg-slate-950/50 text-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all shadow-inner"
                          value={item.cantidad_bajar}
                          onChange={(e) => {
                            const val = e.target.value
                            setSalidaItems(prev => prev.map(i => i.clave_sicar === item.clave_sicar ? {...i, cantidad_bajar: val} : i))
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                         <input
                          type="text"
                          placeholder="Ej. Traspaso..."
                          className="w-full px-3 py-1.5 font-medium border border-slate-700 rounded-lg bg-slate-950/50 text-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all text-sm shadow-inner"
                          value={item.notas}
                          onChange={(e) => {
                            const val = e.target.value
                            setSalidaItems(prev => prev.map(i => i.clave_sicar === item.clave_sicar ? {...i, notas: val} : i))
                          }}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl" 
                          onClick={() => setSalidaItems(prev => prev.filter(i => i.clave_sicar !== item.clave_sicar))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-24 text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-700/50">
                          <Box className="w-8 h-8 text-rose-900/50" />
                        </div>
                        <p className="text-lg font-black text-slate-300 tracking-tight">No hay productos en la lista de salida</p>
                        <p className="text-[10px] uppercase tracking-widest font-bold mt-2">Comience a escanear para bajarlos de bodega</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </>
      ) : activeTab === 'inventario' ? (
      <Card className="glass-panel overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-800/60 bg-slate-900/50 flex justify-between items-center">
          <div className="relative w-full max-w-md">
            <input 
              type="text"
              placeholder="Buscar por descripción o código..."
              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm font-bold text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          </div>
          <div className="flex gap-4 items-center">
            {selectedItems.size > 0 && (
              <Button 
                onClick={handleOpenBajarModal} 
                variant="outline"
                className="gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20 transition-all font-bold text-xs h-9 px-3"
              >
                <Box className="w-4 h-4" /> Bajar de Bodega ({selectedItems.size})
              </Button>
            )}
            <Button 
              onClick={handleExportExcelGlobal} 
              disabled={!inventarioGlobal || inventarioGlobal.length === 0}
              variant="outline"
              className="gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 transition-all font-bold text-xs h-9 px-3"
            >
              <FileSpreadsheet className="w-4 h-4" /> {selectedItems.size > 0 ? `Exportar (${selectedItems.size})` : 'Exportar Todos'}
            </Button>
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">
              {inventarioGlobal?.length || 0} Registros
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 border-b border-slate-800/60 text-slate-500 uppercase tracking-widest text-[10px] font-black">
              <tr>
                <th className="px-6 py-4 w-12">
                  <input type="checkbox" 
                    className="checkbox checkbox-sm checkbox-indigo"
                    checked={inventarioGlobal?.length > 0 && selectedItems.size >= inventarioGlobal?.length}
                    onChange={toggleAllSelection}
                  />
                </th>
                <th className="px-6 py-4">Clave SICAR</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4 text-center text-emerald-400 bg-emerald-500/5">Existencia Físico</th>
                <th className="px-6 py-4">Ubicación</th>
                <th className="px-6 py-4">Última Modificación</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoadingInv ? (
                <tr><td colSpan="6" className="text-center py-20"><span className="loading loading-spinner text-indigo-500"></span></td></tr>
              ) : inventarioGlobal?.length > 0 ? (
                inventarioGlobal.map((item) => (
                  <tr key={item.clave_sicar} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <input type="checkbox" 
                        className="checkbox checkbox-sm checkbox-indigo"
                        checked={selectedItems.has(item.clave_sicar)}
                        onChange={() => toggleSelection(item)}
                      />
                    </td>
                    <td className="px-6 py-4 font-black text-slate-200">{item.clave_sicar}</td>
                    <td className="px-6 py-4 font-medium text-slate-400 text-xs">{item.descripcion || 'N/A'}</td>
                    <td className="px-6 py-4 text-center font-black text-emerald-400 text-lg bg-emerald-500/5">{item.existencia}</td>
                    <td className="px-6 py-4 font-medium text-slate-400 text-xs">{item.ubicacion}</td>
                    <td className="px-6 py-4 font-medium text-slate-500 text-xs">{new Date(item.fecha_actualizacion).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right flex gap-2 justify-end">
                      <Button 
                        variant="ghost" size="icon" 
                        title="Ver Historial"
                        className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl w-8 h-8"
                        onClick={() => setHistorialProducto(item)}
                      >
                        <Clock className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" size="icon" 
                        title="Eliminar Registro"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl w-8 h-8"
                        onClick={() => {
                           if (window.confirm('¿Está seguro de eliminar este producto del inventario de bodega?')) {
                             handleDeleteBodega(item.clave_sicar)
                           }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="py-24 text-center text-slate-500 font-bold">No se encontraron productos en bodega.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      ) : null}

      {/* MODAL HISTORIAL */}
      {historialProducto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setHistorialProducto(null); }}>
          <div className="bg-slate-950 border border-slate-800 shadow-2xl rounded-3xl max-w-3xl w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-800/60 bg-slate-900/50 flex justify-between items-start">
              <div>
                <h3 className="font-black text-xl text-slate-100 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-indigo-400" /> Historial de Movimientos
                </h3>
                <p className="text-sm font-bold text-slate-400 mt-1">{historialProducto.clave_sicar} - {historialProducto.descripcion}</p>
              </div>
              <button onClick={() => setHistorialProducto(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-800/50 text-slate-400 text-[10px] uppercase font-extrabold tracking-wider sticky top-0">
                  <tr>
                    <th className="p-4 pl-6">Fecha</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4 text-right">Cantidad</th>
                    <th className="p-4">Usuario</th>
                    <th className="p-4 pr-6">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {isLoadingHistorial ? (
                    <tr><td colSpan="5" className="text-center py-10"><span className="loading loading-spinner text-indigo-500"></span></td></tr>
                  ) : historialData?.length > 0 ? (
                    historialData.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/30">
                        <td className="p-4 pl-6 text-xs text-slate-400 font-mono">{new Date(m.fecha).toLocaleString()}</td>
                        <td className={`p-4 text-xs font-bold ${m.tipo === 'ENTRADA' ? 'text-emerald-400' : (m.tipo === 'SALIDA' ? 'text-red-400' : 'text-slate-400')}`}>{m.tipo}</td>
                        <td className="p-4 text-right font-black text-slate-200">{m.cantidad}</td>
                        <td className="p-4 text-xs font-bold text-indigo-300">{m.usuario || 'Sistema'}</td>
                        <td className="p-4 pr-6 text-xs text-slate-500">{m.notas || ''}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="5" className="text-center py-10 text-slate-500 font-bold text-xs uppercase">No hay movimientos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-900/50 border-t border-slate-800/60 flex justify-end">
              <Button onClick={() => setHistorialProducto(null)} variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700">Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BAJAR INVENTARIO */}
      {showBajarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowBajarModal(false); }}>
          <div className="bg-slate-950 border border-slate-800 shadow-2xl rounded-3xl max-w-4xl w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-800/60 bg-slate-900/50 flex justify-between items-start">
              <div>
                <h3 className="font-black text-xl text-slate-100 flex items-center gap-3">
                  <Box className="w-6 h-6 text-rose-400" /> Bajar Productos de Bodega
                </h3>
                <p className="text-sm font-bold text-slate-400 mt-1">Especifique la cantidad a restar del inventario físico</p>
              </div>
              <button onClick={() => setShowBajarModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/80 border-b border-slate-800/60 text-slate-500 uppercase tracking-widest text-[10px] font-black sticky top-0">
                  <tr>
                    <th className="px-6 py-4">Clave</th>
                    <th className="px-6 py-4">Descripción</th>
                    <th className="px-6 py-4 text-center">Existencia</th>
                    <th className="px-6 py-4 text-center">Cant. a Bajar</th>
                    <th className="px-6 py-4">Notas (Opcional)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {bajarItems.map(item => (
                    <tr key={item.clave_sicar} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-black text-slate-200">{item.clave_sicar}</td>
                      <td className="px-6 py-4 font-medium text-slate-400 text-xs">{item.descripcion}</td>
                      <td className="px-6 py-4 text-center font-bold text-slate-500">{item.existencia}</td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min="1"
                          max={item.existencia}
                          className="w-24 px-2 py-1.5 text-center font-bold border border-slate-700 rounded-lg bg-slate-950/50 text-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all shadow-inner"
                          value={item.cantidad_bajar}
                          onChange={(e) => updateBajarItem(item.clave_sicar, 'cantidad_bajar', e.target.value)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          placeholder="Ej. Traspaso a tienda"
                          className="w-full px-3 py-1.5 font-medium border border-slate-700 rounded-lg bg-slate-950/50 text-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all text-xs shadow-inner"
                          value={item.notas}
                          onChange={(e) => updateBajarItem(item.clave_sicar, 'notas', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 bg-slate-900/50 border-t border-slate-800/60 flex justify-end gap-3">
              <Button onClick={() => setShowBajarModal(false)} variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold">
                Cancelar
              </Button>
              <Button 
                onClick={handleBajarSubmit} 
                disabled={isBajarSaving}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                {isBajarSaving ? 'Procesando...' : 'Confirmar y Generar Excel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CANTIDAD ESCÁNER */}
      {scannedItemPendingQuantity && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setScannedItemPendingQuantity(null); }}>
          <form 
             className="bg-slate-950 border border-slate-800 shadow-2xl rounded-3xl max-w-sm w-full overflow-hidden"
             onSubmit={(e) => {
               e.preventDefault()
               const fd = new FormData(e.target)
               const cantidad = Number(fd.get('cantidad')) || 1
               const { mode, isNew, product } = scannedItemPendingQuantity
               
               if (mode === 'captura') {
                  if (isNew) {
                     setCapturedItems(prev => [{ ...product, cantidad: Number(product.existencia) + cantidad }, ...prev])
                  } else {
                     setCapturedItems(prev => prev.map(item => item.clave_sicar === product.clave_sicar ? { ...item, cantidad: Number(item.cantidad) + cantidad } : item))
                  }
               } else {
                  const currentQty = isNew ? 0 : Number(salidaItems.find(i => i.clave_sicar === product.clave_sicar)?.cantidad_bajar || 0)
                  if (currentQty + cantidad > Number(product.existencia)) {
                     toast.error(`Error: Intentas bajar ${currentQty + cantidad}, pero solo hay ${product.existencia} en existencia.`)
                     return
                  }
                  
                  if (isNew) {
                     setSalidaItems(prev => [{ ...product, cantidad_bajar: cantidad, notas: '' }, ...prev])
                  } else {
                     setSalidaItems(prev => prev.map(item => item.clave_sicar === product.clave_sicar ? { ...item, cantidad_bajar: Number(item.cantidad_bajar) + cantidad } : item))
                  }
               }
               
               toast.success(`+${cantidad} a ${product.clave_sicar}`)
               setScannedItemPendingQuantity(null)
               
               setTimeout(() => {
                  if (mode === 'captura') inputRef.current?.focus()
                  else salidaInputRef.current?.focus()
               }, 50)
             }}
          >
            <div className="p-6 border-b border-slate-800/60 bg-slate-900/50 flex justify-between items-start">
              <div>
                <h3 className="font-black text-xl text-slate-100">Cantidad a procesar</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">{scannedItemPendingQuantity.product.descripcion}</p>
              </div>
              <button type="button" onClick={() => {
                 setScannedItemPendingQuantity(null)
                 setTimeout(() => {
                    if (scannedItemPendingQuantity.mode === 'captura') inputRef.current?.focus()
                    else salidaInputRef.current?.focus()
                 }, 50)
              }} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <input
                autoFocus
                name="cantidad"
                type="number"
                min="1"
                defaultValue={1}
                className="w-full text-center text-4xl py-6 font-black border border-slate-700 rounded-xl bg-slate-900/50 text-indigo-400 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-inner"
              />
            </div>
            
            <div className="p-4 bg-slate-900/50 border-t border-slate-800/60 flex justify-end gap-3">
              <Button type="submit" className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg">
                Confirmar (Enter)
              </Button>
            </div>
          </form>
        </div>
      )}

    </div>
  )
}
