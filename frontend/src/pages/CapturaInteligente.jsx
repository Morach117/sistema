import { useState, useRef, useEffect } from 'react'
import axios from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import CaptureDetails from '@/features/captura/CaptureDetails'
import { BoxSelect, RotateCcw, Link2, ArrowRight, Trash2, X, Settings } from 'lucide-react'
import Swal from 'sweetalert2'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export default function CapturaInteligente() {
  const queryClient = useQueryClient()
  const inputRef = useRef(null)
  const inputVinculoRef = useRef(null)
  const inputFactorRef = useRef(null)
  const inputBultosRef = useRef(null)
  const inputExistenciaRef = useRef(null)
  
  // ESPERA, BUSCANDO, CAPTURANDO
  const [estado, setEstado] = useState('ESPERA') 
  const [codigo, setCodigo] = useState('')
  const [datosProd, setDatosProd] = useState(null)
  
  const [codigoSuelto, setCodigoSuelto] = useState('')
  const [mostrarVinculo, setMostrarVinculo] = useState(false)
  const [modalRevincular, setModalRevincular] = useState(false)
  const [revinculoCodigo, setRevinculoCodigo] = useState('')
  const [revinculoFactor, setRevinculoFactor] = useState(1)
  const [revinculoProducto, setRevinculoProducto] = useState(null)
  
  // Selección de Múltiples Productos
  const [modalMultiples, setModalMultiples] = useState(false)
  const [opcionesMultiples, setOpcionesMultiples] = useState([])

  // Factores Conocidos (Botones rápidos)
  const [factoresConocidos, setFactoresConocidos] = useState([])

  // Cantidades (Factor -> Bultos -> Sueltos)
  const [factor, setFactor] = useState(1)
  const [bultos, setBultos] = useState(0)
  const [existencia, setExistencia] = useState(0)
  const [isConsumo, setIsConsumo] = useState(false)
  
  // Modal para gestionar variantes (CRUD)
  const [modalGestionVariantes, setModalGestionVariantes] = useState(false)
  const [variantesLista, setVariantesLista] = useState([])
  const [nuevaVariante, setNuevaVariante] = useState({ nombre: '', factor: '' })

  const { data: historial, isLoading: loadingHistorial } = useQuery({
    queryKey: ['captura_historial'],
    queryFn: async () => {
      const res = await axios.get('/api/captura/historial')
      return res.data.data
    }
  })

  // Enfocar input principal al resetear y listener de tecla Escape
  useEffect(() => {
    if (estado === 'ESPERA') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape' && !modalRevincular && !modalGestionVariantes && !modalMultiples) {
        resetear()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [estado, modalRevincular, modalGestionVariantes, modalMultiples])

  // Paso 1 & 2: Verificar código
  const verificarCodigo = async (e) => {
    if (e.key === 'Enter' && codigo.trim() !== '') {
      e.preventDefault()
      if (estado === 'BUSCANDO') return
      setEstado('BUSCANDO')
      
      try {
        const { data } = await axios.post('/api/captura/verificar', { codigo: codigo.trim() })
        
        if (data.multiple && data.matches && data.matches.length > 1) {
            setOpcionesMultiples(data.matches)
            setModalMultiples(true)
            return
        }

        let match = data.match || (data.matches && data.matches[0])
        
        if (!match) {
          match = {
            clave_sicar: codigo.trim(),
            descripcion_caja: 'PRODUCTO NUEVO (SIN REGISTRO)',
            factor: 1,
            tipo: 'NUEVO_DESCONOCIDO',
            modo_preferido: 'VENTA'
          }
        }
        
        iniciarProcesoSecuencial(match, codigo.trim())
      } catch (err) {
        console.error(err)
        const msg = err.response?.data?.error || err.message || 'Error al consultar código'
        Swal.fire('Error', msg, 'error')
        resetear()
      }
    }
  }

  // Paso 2: Iniciar proceso para TODOS los códigos
  const iniciarProcesoSecuencial = (match, codLeido) => {
    setDatosProd({ ...match, codigo_leido: codLeido })
    setEstado('CAPTURANDO')
    
    const esUso = match.modo_preferido === 'CONSUMO' || isConsumo
    setIsConsumo(esUso)

    // Si ya está vinculado en memoria como caja
    if (match.tipo === 'EMPAQUE' || (match.factor && match.factor > 1)) {
      setMostrarVinculo(false)
      setFactor(match.factor || 1)
      setBultos(0)
      setExistencia(0)

      setTimeout(() => {
        if (esUso) {
          inputExistenciaRef.current?.focus()
          inputExistenciaRef.current?.select()
        } else {
          inputBultosRef.current?.focus()
          inputBultosRef.current?.select()
        }
      }, 100)
    } else {
      // Si NO está vinculado como caja -> Pedir vincular pieza suelta primero
      if (!esUso) {
        setMostrarVinculo(true)
        setFactor(1)
        setBultos(0)
        setExistencia(0)
        setTimeout(() => inputVinculoRef.current?.focus(), 100)
      } else {
        setMostrarVinculo(false)
        setFactor(1)
        setBultos(0)
        setExistencia(0)
        setTimeout(() => {
          inputExistenciaRef.current?.focus()
          inputExistenciaRef.current?.select()
        }, 100)
      }
    }
  }

  // Paso 3: Buscar y vincular pieza suelta
  const buscarVinculo = async (e) => {
    if (e.key === 'Enter' && codigoSuelto.trim() !== '') {
      e.preventDefault()
      try {
        const { data } = await axios.post('/api/captura/verificar', { codigo: codigoSuelto.trim() })
        let suelto = data.match || (data.matches && data.matches[0])
        
        if (suelto && suelto.tipo !== 'NUEVO_DESCONOCIDO') {
          setMostrarVinculo(false)
          
          let nombreCaja = datosProd.descripcion_caja
          if (!nombreCaja || nombreCaja === 'PRODUCTO NUEVO (SIN REGISTRO)') {
            nombreCaja = 'Caja de Proveedor'
          }
          let nombrePieza = suelto.descripcion_caja
          
          setDatosProd({
            ...datosProd,
            clave_sicar_final: suelto.clave_sicar,
            nombre_suelto: `CAJA: ${nombreCaja} ➔ PIEZA: ${nombrePieza}`
          })
          
          // Buscar factores conocidos para este producto
          try {
            const { data: dataFactores } = await axios.get(`/api/captura/factores/${suelto.clave_sicar}`)
            if (dataFactores.success && dataFactores.data.length > 0) {
               setFactoresConocidos(dataFactores.data)
            } else {
               setFactoresConocidos([])
            }
          } catch(e) { console.error('Error obteniendo factores', e); }

          // Modal de cantidad de piezas (se usa el campo secuencial)
          setTimeout(() => {
            inputFactorRef.current?.focus()
            inputFactorRef.current?.select()
          }, 100)
        } else {
          Swal.fire('Atención', 'La pieza suelta escaneada no existe en el catálogo', 'warning')
          setCodigoSuelto('')
        }
      } catch (err) {
        Swal.fire('Error', err.response?.data?.error || 'Error al buscar vinculo', 'error')
        setCodigoSuelto('')
      }
    }
  }

  // Omitir vinculación (es pieza individual)
  const omitirVinculo = () => {
    setMostrarVinculo(false)
    setDatosProd({ ...datosProd, nombre_suelto: datosProd.descripcion_caja || "Pieza Individual" })
    setFactor(1)
    setTimeout(() => {
      inputFactorRef.current?.focus()
      inputFactorRef.current?.select()
    }, 100)
  }

  // Cálculo total
  const calcularTotal = () => {
    const b = parseFloat(bultos) || 0
    const f = parseFloat(factor) || 0
    const e = parseFloat(existencia) || 0
    return (b * f) + e
  }

  // Resetear todo
  const resetear = () => {
    setEstado('ESPERA')
    setCodigo('')
    setDatosProd(null)
    setCodigoSuelto('')
    setMostrarVinculo(false)
    setFactor(1)
    setBultos(0)
    setExistencia(0)
    setIsConsumo(false)
    setFactoresConocidos([])
    setModalGestionVariantes(false)
    setModalMultiples(false)
  }

  // Guardar en backend
  const guardarMutation = useMutation({
    mutationFn: (payload) => axios.post('/api/captura/guardar', payload),
    onSuccess: () => {
      Swal.fire({ 
        toast: true, 
        position: 'top-end', 
        icon: 'success', 
        title: isConsumo ? 'Uso Registrado' : 'Inventario Capturado', 
        showConfirmButton: false, 
        timer: 1500 
      })
      queryClient.invalidateQueries(['captura_historial'])
      resetear()
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Error al guardar captura', 'error')
  })

  // Función para Revincular
  const [historialSeleccionado, setHistorialSeleccionado] = useState(null)

  const abrirModalRevincular = (h) => {
    setHistorialSeleccionado(h)
    setRevinculoCodigo('')
    setRevinculoFactor(h.factor || 1)
    setRevinculoProducto(null)
    setModalRevincular(true)
  }

  const eliminarHistorial = (id) => {
    Swal.fire({
      title: '¿Eliminar registro?',
      text: 'Se descartará esta captura.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Eliminar'
    }).then(async (res) => {
      if (res.isConfirmed) {
        try {
          await axios.post('/api/captura/eliminar', { id })
          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Registro eliminado', showConfirmButton: false, timer: 1500 })
          queryClient.invalidateQueries(['captura_historial'])
        } catch(err) {
          Swal.fire('Error', err.response?.data?.error || 'Error al eliminar', 'error')
        }
      }
    })
  }

  const handleRevincular = async (e) => {
    e.preventDefault()
    if (!revinculoCodigo.trim()) return

    try {
      // 1. Verificar si el código nuevo existe
      const { data } = await axios.post('/api/captura/verificar', { codigo: revinculoCodigo.trim() })
      let suelto = data.match || (data.matches && data.matches[0])
      
      if (suelto && suelto.tipo !== 'NUEVO_DESCONOCIDO') {
        setRevinculoProducto(suelto)
      } else {
        Swal.fire('Atención', 'La pieza suelta escaneada no existe en el catálogo', 'warning')
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al buscar el código', 'error')
    }
  }

  const confirmarRevincular = async () => {
    try {
      if (historialSeleccionado) {
        // Corregir desde el historial
        await axios.post('/api/captura/corregir_captura', {
          id_historial: historialSeleccionado.id,
          codigo_barras: historialSeleccionado.codigo,
          nueva_clave_sicar: revinculoProducto.clave_sicar,
          nuevo_factor: revinculoFactor
        })
        queryClient.invalidateQueries(['captura_historial'])
      } else {
        // Corregir la caja que se está escaneando actualmente
        await axios.post('/api/captura/revincular', {
          codigo_caja: datosProd.codigo_leido,
          nueva_clave_sicar: revinculoProducto.clave_sicar,
          nuevo_factor: revinculoFactor
        })
      }
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Vinculación actualizada', showConfirmButton: false, timer: 1500 })
      setModalRevincular(false)
      setHistorialSeleccionado(null)
      if (!historialSeleccionado) resetear()
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al revincular', 'error')
    }
  }

  const confirmarGuardar = async () => {
    const total = calcularTotal()
    if (total <= 0) return

    let claveParaGuardar = datosProd?.clave_sicar_final || datosProd?.clave_sicar || codigo
    let nombreFinal = datosProd?.nombre_suelto || datosProd?.descripcion_caja
    if (!nombreFinal || nombreFinal === '---') nombreFinal = "Producto Manual"

    const factorFinal = isConsumo ? 1 : (parseFloat(factor) || 1);

    guardarMutation.mutate({
      codigo: datosProd?.codigo_leido || codigo.trim(),
      existencia: parseFloat(existencia) || 0,
      bultos: isConsumo ? 0 : (parseFloat(bultos) || 0),
      factor: factorFinal,
      clave_sicar: claveParaGuardar,
      descripcion_actual: nombreFinal,
      tipo_uso: isConsumo ? 'CONSUMO' : 'VENTA',
      registrar_nuevo: !!datosProd?.clave_sicar_final
    })
  }

  // Cargar variantes para gestionar
  const cargarVariantes = async () => {
    try {
        const claveSicar = datosProd.clave_sicar_final || datosProd.clave_sicar || codigo.trim();
        const { data } = await axios.get(`/api/captura/variantes/${claveSicar}`);
        setVariantesLista(data.data || []);
    } catch(e) { console.error('Error cargando variantes', e) }
  }

  // Guardar nueva variante (dentro de gestion)
  const guardarNuevaVariante = async () => {
    if (!nuevaVariante.nombre.trim() || !nuevaVariante.factor) return;
    try {
        await axios.post('/api/captura/agregar_variante', {
            clave_sicar: datosProd.clave_sicar_final || datosProd.clave_sicar || codigo.trim(),
            descripcion: nuevaVariante.nombre,
            factor: nuevaVariante.factor
        });
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Variante guardada', showConfirmButton: false, timer: 1500 });
        setNuevaVariante({ nombre: '', factor: '' });
        cargarVariantes(); // Recargar lista
      } catch (e) {
        Swal.fire('Error', e.response?.data?.error || 'Error al guardar variante', 'error');
    }
  }

  // Eliminar variante
  const eliminarVariante = async (id) => {
    try {
        await axios.delete(`/api/captura/variante/${id}`);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Variante eliminada', showConfirmButton: false, timer: 1500 });
        cargarVariantes();
    } catch (e) {
        Swal.fire('Error', e.response?.data?.error || 'Error al eliminar', 'error');
    }
  }
  
  // Refrescar al cerrar modal de gestion
  const cerrarModalGestion = async () => {
      setModalGestionVariantes(false);
      
      const cod = datosProd?.codigo_leido || codigo?.trim();
      if (!cod) return;

      // Volver a cargar el código para ver los cambios reflejados
      try {
          const { data } = await axios.post('/api/captura/verificar', { codigo: cod });
          if (data.multiple) {
              setOpcionesMultiples(data.matches);
              setModalMultiples(true);
          } else if (data.match) {
              iniciarProcesoSecuencial(data.match, cod);
          }
      } catch {}
  }

  // Navegación Enter secuencial entre inputs
  const handleKeyDownStep = (e, currentStep) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (currentStep === 'factor') {
        inputBultosRef.current?.focus()
        inputBultosRef.current?.select()
      } else if (currentStep === 'bultos') {
        inputExistenciaRef.current?.focus()
        inputExistenciaRef.current?.select()
      } else if (currentStep === 'existencia') {
        if (calcularTotal() > 0) {
          confirmarGuardar()
        }
      }
    }
  }

  // Cambio de modo Consumo
  const handleToggleConsumo = (checked) => {
    setIsConsumo(checked)
    if (checked) {
      setMostrarVinculo(false)
      setFactor(1)
      setBultos(0)
      setTimeout(() => {
        inputExistenciaRef.current?.focus()
        inputExistenciaRef.current?.select()
      }, 100)
    } else {
      setTimeout(() => {
        inputFactorRef.current?.focus()
        inputFactorRef.current?.select()
      }, 100)
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 pb-10 max-w-screen-2xl mx-auto w-full select-none">
      
      {/* Encabezado */}
      <Card className="glass-panel shrink-0 border-slate-800/60 bg-slate-900/40">
        <CardContent className="p-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${isConsumo ? 'bg-gradient-to-br from-orange-500 to-amber-600 shadow-orange-500/20' : 'bg-gradient-to-br from-indigo-600 to-violet-600 shadow-indigo-500/20'}`}>
              <BoxSelect className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-100 uppercase">Captura de Inventario</h1>
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                {isConsumo ? 'Modo Consumo Interno (Uso)' : 'Modo Estándar Cajas / Sueltos'}
              </span>
            </div>
          </div>
          <Button variant="outline" className="gap-2 font-bold bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 shadow-inner" onClick={() => queryClient.invalidateQueries(['captura_historial'])}>
            <RotateCcw className="w-4 h-4" /> Actualizar Historial
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 shrink-0">
        
        {/* Paso 1: Código de Barras Principal */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/3">
            <label htmlFor="capture-barcode" className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 ml-1">
              1. CÓDIGO DE BARRAS PRINCIPAL
            </label>
            <input 
              id="capture-barcode"
              ref={inputRef}
              type="text" 
              className="w-full h-20 px-6 text-3xl font-mono font-black text-slate-100 bg-slate-950/60 border-2 border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 rounded-2xl transition-all shadow-inner outline-none placeholder:text-slate-600" 
              placeholder="Escanear código..." 
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={verificarCodigo}
              disabled={estado !== 'ESPERA'}
              autoComplete="off"
            />
          </div>

          {/* Tarjeta de Información e Identificación del Producto */}
          <div className={`flex-1 border-2 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden transition-all shadow-inner ${
            estado === 'ESPERA' ? 'bg-slate-900/40 border-slate-800' : 
            estado === 'BUSCANDO' ? 'bg-indigo-900/20 border-indigo-500/40' :
            isConsumo ? 'bg-orange-950/20 border-orange-500/40' : 'bg-indigo-950/20 border-indigo-500/40'
          }`}>
            <span className={`text-[10px] font-black uppercase tracking-widest mb-1 drop-shadow ${
              estado === 'ESPERA' ? 'text-slate-500' :
              estado === 'BUSCANDO' ? 'text-indigo-400' :
              isConsumo ? 'text-orange-400' : 'text-indigo-400'
            }`}>
              {estado === 'ESPERA' ? 'ESPERANDO LECTURA DE CÓDIGO...' : 
               estado === 'BUSCANDO' ? 'CONSULTANDO CATÁLOGO...' :
               datosProd?.nombre_suelto ? 'PRODUCTO VINCULADO CORRECTAMENTE' :
               (datosProd?.factor > 1 ? 'CAJA IDENTIFICADA EN SISTEMA' : 'PIEZA / EMPAQUE DETECTADO')}
            </span>
            
            <div className="text-2xl font-black text-slate-100 leading-tight flex items-center flex-wrap gap-3">
              <div className="truncate">
                {estado === 'ESPERA' || estado === 'BUSCANDO' ? '---' : 
                 datosProd?.nombre_suelto ? (
                   <CaptureDetails name={datosProd.nombre_suelto} />
                 ) : datosProd?.descripcion_caja}
              </div>
              
              {estado === 'CAPTURANDO' && datosProd?.factor > 1 && !isConsumo && (
                <Button variant="ghost" size="sm" onClick={() => setModalRevincular(true)} className="ml-auto bg-slate-800/50 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs">
                  <RotateCcw className="w-3 h-3 mr-2" /> Corregir
                </Button>
              )}
            </div>

            {/* Franja Emergente de Vinculación de Pieza Suelta */}
            {mostrarVinculo && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-between px-6 z-10 border border-amber-500/40 rounded-2xl animate-in fade-in">
                <div className="flex-1 flex items-center gap-4">
                    <div className="bg-amber-500/20 p-2.5 rounded-xl text-amber-400"><Link2 className="w-6 h-6" /></div>
                    <div className="flex-1">
                        <label htmlFor="capture-loose-barcode" className="text-amber-400 font-extrabold text-xs block mb-1 tracking-wider uppercase">
                          2. Escanea la Pieza Suelta que contiene este empaque (Opcional)
                        </label>
                        <input id="capture-loose-barcode" type="text"
                            ref={inputVinculoRef}
                            value={codigoSuelto}
                            onChange={(e) => setCodigoSuelto(e.target.value)}
                            onKeyDown={buscarVinculo}
                            className="w-full h-11 px-4 font-mono font-bold border-2 border-amber-500/50 focus:border-amber-400 focus:ring-4 focus:ring-amber-500/20 bg-slate-900 rounded-xl outline-none text-slate-100 placeholder:text-slate-600 transition-all text-sm"
                            placeholder="Escanea la pieza aquí..."
                        />
                    </div>
                </div>
                <Button variant="ghost" onClick={omitirVinculo} className="ml-4 text-xs font-bold text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/30 uppercase tracking-widest">
                    Omitir ✖
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Zona Secuencial de Captura de Cantidades */}
        {estado === 'CAPTURANDO' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end glass-panel bg-slate-900/60 p-6 rounded-[2rem] border-t border-t-indigo-500/30 animate-in slide-in-from-top-4 duration-300">
             
             {/* 1. PZ x Bulto (Factor) */}
             <div className="col-span-1 md:col-span-3 relative">
                <label htmlFor="capture-factor" className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 text-center">
                  1. PZ x BULTO (FACTOR)
                </label>
                <input 
                  id="capture-factor"
                  type="number" 
                  ref={inputFactorRef}
                  className="w-full h-20 text-center text-4xl font-black text-slate-100 border-2 border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 bg-slate-950/50 rounded-2xl transition-all outline-none disabled:opacity-30 disabled:bg-slate-950"
                  value={factor}
                  onChange={e => setFactor(e.target.value)}
                  disabled={isConsumo}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => handleKeyDownStep(e, 'factor')}
                />
                
                {/* Botones rápidos de factores conocidos */}
                {!isConsumo && factoresConocidos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 justify-center animate-in fade-in">
                     <span className="w-full text-[9px] text-slate-500 font-bold uppercase tracking-widest text-center mb-1">
                       Opciones Conocidas:
                     </span>
                     {factoresConocidos.map((f, idx) => (
                         <button
                           type="button"
                          key={idx}
                          onClick={() => {
                             setFactor(f)
                             setTimeout(() => {
                               inputBultosRef.current?.focus()
                               inputBultosRef.current?.select()
                             }, 100)
                          }}
                          className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 font-black text-sm rounded-xl border border-indigo-500/30 transition-all active:scale-95"
                        >
                          {f} pz
                        </button>
                     ))}
                  </div>
                )}
                
                {/* Botón para crear/gestionar variante (si es empaque o se está vinculando) */}
                {(datosProd?.tipo === 'EMPAQUE' || datosProd?.clave_sicar_final) && !isConsumo && (
                  <div className="mt-4 flex items-center justify-center">
                    <button 
                      type="button"
                      onClick={() => {
                        setModalGestionVariantes(true);
                        cargarVariantes();
                      }}
                      className="text-[9px] font-bold text-slate-300 hover:text-white uppercase tracking-widest cursor-pointer select-none border border-slate-700/50 hover:bg-slate-800/50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2"
                    >
                      <Settings className="w-3.5 h-3.5 text-indigo-400" /> Gestionar Variantes (CRUD)
                    </button>
                  </div>
                )}
             </div>

             {/* 2. Bultos / Cajas */}
             <div className="col-span-1 md:col-span-3 relative">
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 text-slate-600 font-black text-2xl hidden md:block">×</div>
                <label htmlFor="capture-boxes" className="block text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest mb-2 text-center drop-shadow">
                  2. BULTOS / CAJAS
                </label>
                <input 
                  id="capture-boxes"
                  type="number" 
                  ref={inputBultosRef}
                  className="w-full h-20 text-center text-5xl font-black text-indigo-400 border-2 border-indigo-500/40 bg-indigo-500/10 rounded-2xl focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 outline-none shadow-inner transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  value={bultos}
                  onChange={e => setBultos(e.target.value)}
                  disabled={isConsumo}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => handleKeyDownStep(e, 'bultos')}
                />
             </div>

             {/* 3. Piezas Sueltas */}
             <div className="col-span-1 md:col-span-2 relative">
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 text-slate-600 font-black text-2xl hidden md:block">+</div>
                <label htmlFor="capture-loose-count" className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 text-center">
                  3. SUELTOS (PZ)
                </label>
                <input 
                  id="capture-loose-count"
                  type="number" 
                  ref={inputExistenciaRef}
                  className={`w-full h-20 text-center text-3xl font-black bg-slate-950/50 border-2 rounded-2xl outline-none transition-all shadow-inner ${isConsumo ? 'border-orange-500/50 text-orange-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/20' : 'border-slate-700 text-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20'}`}
                  value={existencia}
                  onChange={e => setExistencia(e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => handleKeyDownStep(e, 'existencia')}
                />
             </div>

             {/* Botón de Confirmación y Switch de Uso Interno */}
             <div className="col-span-1 md:col-span-4 flex flex-col justify-end h-full gap-3 md:pl-2">
                <div className="flex justify-end items-center pr-2">
                   <label htmlFor="capture-internal-use" className="flex items-center cursor-pointer select-none">
                      <span className="text-[10px] font-black text-slate-400 hover:text-orange-400 tracking-widest mr-3 transition-colors uppercase">
                        ¿ES PARA USO INTERNO?
                      </span>
                      <input 
                        id="capture-internal-use"
                        type="checkbox" 
                        className="toggle toggle-warning toggle-sm border-orange-500/50 bg-orange-500/20" 
                        checked={isConsumo} 
                        onChange={e => handleToggleConsumo(e.target.checked)} 
                      />
                   </label>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" className="h-20 w-16 rounded-2xl border-2 border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-100 shadow-inner" onClick={resetear}>
                    <RotateCcw className="w-6 h-6" />
                  </Button>
                  <Button 
                    className={`flex-1 h-20 rounded-2xl font-black text-xl transition-all active:scale-95 text-white ${
                      calcularTotal() > 0 
                      ? (isConsumo ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-lg shadow-orange-500/30' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30') 
                      : 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed shadow-none'
                    }`}
                    disabled={calcularTotal() <= 0 || guardarMutation.isPending}
                    onClick={confirmarGuardar}
                  >
                    {guardarMutation.isPending ? <LoadingState compact label="Guardando…" className="py-0 text-white" /> : isConsumo ? 'REGISTRAR USO' : 'CONFIRMAR (Enter)'}
                    <div className="ml-auto bg-black/30 px-3 py-2 rounded-xl flex flex-col items-center leading-none border border-white/10">
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-80 mb-0.5 text-white">TOTAL</span>
                      <span className="font-mono text-2xl text-white">{calcularTotal()}</span>
                    </div>
                  </Button>
                </div>
             </div>

          </div>
        )}
      </div>

      {/* Historial del día */}
      <Card className="glass-panel flex-1 min-h-0 flex flex-col overflow-hidden border-slate-800/60 bg-slate-900/40">
        <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/50 flex justify-between items-center shrink-0">
           <span className="font-black text-slate-300 text-[10px] uppercase tracking-widest">
             Historial de Capturas de Hoy
           </span>
           <span className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-xs font-mono font-black border border-indigo-500/20 shadow-sm">
             {historial?.length || 0} registros
           </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
           <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 text-slate-500 text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-4 border-b border-slate-800/60 w-36">CÓDIGO</th>
                    <th className="p-4 border-b border-slate-800/60">DESCRIPCIÓN</th>
                    <th className="p-4 border-b border-slate-800/60 text-center w-36">USUARIO</th>
                    <th className="p-4 border-b border-slate-800/60 text-center w-28">TIPO USO</th>
                    <th className="p-4 border-b border-slate-800/60 text-center w-28">CANTIDAD TOTAL</th>
                    <th className="p-4 border-b border-slate-800/60 text-right w-24">ACCIONES</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                 {loadingHistorial ? (
                   <tr><td colSpan="6"><LoadingState compact label="Cargando historial…" className="py-12" /></td></tr>
                 ) : historial?.length === 0 ? (
                   <tr><td colSpan="6" className="text-center py-12 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Sin registros hoy</td></tr>
                 ) : (
                   historial?.map((h) => {
                     const isExportado = Number(h.exportado) === 1
                     return (
                     <tr key={h.id} className={`transition-colors ${isExportado ? 'bg-slate-950/40 text-slate-400 opacity-75' : 'hover:bg-slate-800/30'}`}>
                       <td className={`p-4 font-mono font-black text-xs ${isExportado ? 'text-slate-400' : 'text-slate-300'}`}>{h.codigo}</td>
                       <td className={`p-4 font-black text-sm ${isExportado ? 'text-slate-400' : 'text-slate-100'}`}>
                         {h.descripcion_cache || h.descripcion_actual}
                       </td>
                       <td className="p-4 text-center text-xs font-bold text-indigo-300">
                         {h.capturista || 'Sistema'}
                       </td>
                       <td className="p-4 text-center">
                         <span className={`px-2 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-black border ${h.tipo_uso === 'CONSUMO' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                           {h.tipo_uso}
                         </span>
                       </td>
                       <td className={`p-4 text-center font-black text-lg ${isExportado ? 'text-slate-400' : 'text-slate-100'}`}>
                         {h.total_unidades !== undefined ? h.total_unidades : ((parseFloat(h.cantidad_bultos) * parseFloat(h.factor)) + parseFloat(h.existencia))}
                       </td>
                       <td className="p-4 text-right space-x-1">
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20" title="Corregir Vínculo" onClick={() => abrirModalRevincular(h)}>
                           <Link2 className="w-4 h-4" />
                         </Button>
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20" title="Eliminar Registro" onClick={() => eliminarHistorial(h.id)}>
                           <Trash2 className="w-4 h-4" />
                         </Button>
                       </td>
                     </tr>
                   )})
                 )}
              </tbody>
           </table>
        </div>
      </Card>

      {/* Modal Revincular */}
      <Dialog open={modalRevincular} onOpenChange={(open) => {
        setModalRevincular(open)
        if (!open) {
          setHistorialSeleccionado(null)
          setRevinculoProducto(null)
        }
      }}>
        <DialogContent className="max-w-md overflow-hidden border-slate-700 bg-slate-900 p-0" showCloseButton={false}>
            <div className="p-6 border-b border-slate-800/60 bg-slate-800/50 flex justify-between items-start">
              <DialogHeader>
              <DialogTitle className="font-black text-xl text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-orange-400" /> Corregir Vinculación
              </DialogTitle>
              <DialogDescription className="sr-only">Escanea la pieza correcta y confirma su factor.</DialogDescription>
              </DialogHeader>
              <button type="button" aria-label="Cerrar corrección de vinculación" onClick={() => { setModalRevincular(false); setHistorialSeleccionado(null); setRevinculoProducto(null); }} className="text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {!revinculoProducto ? (
                <form onSubmit={handleRevincular}>
                  <label htmlFor="relink-barcode" className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Escanear pieza correcta
                  </label>
                  <input id="relink-barcode" type="text" autoFocus value={revinculoCodigo} onChange={e => setRevinculoCodigo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setModalRevincular(false)
                        setHistorialSeleccionado(null)
                        setRevinculoProducto(null)
                      }
                    }}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-mono focus:border-orange-500 outline-none focus:ring-1 focus:ring-orange-500" 
                    placeholder="Código de la pieza suelta..." />
                  <div className="flex gap-3 mt-4">
                    <Button type="button" variant="outline" className="flex-1 rounded-xl bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 font-bold" onClick={() => { setModalRevincular(false); setHistorialSeleccionado(null); setRevinculoProducto(null); }}>Cancelar</Button>
                    <Button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl">Verificar</Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                    <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest mb-1">Producto detectado</p>
                    <p className="font-black text-slate-200">{revinculoProducto.descripcion_caja}</p>
                  </div>
                  <div>
                    <label htmlFor="relink-factor" className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      ¿Cuántas piezas trae la caja? (Factor)
                    </label>
                    <input id="relink-factor" type="number" autoFocus value={revinculoFactor} onChange={e => setRevinculoFactor(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-black text-xl text-center focus:border-orange-500 outline-none" 
                      min="1" />
                  </div>

                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" className="flex-1 rounded-xl bg-slate-800 border-slate-700" onClick={() => setRevinculoProducto(null)}>Atrás</Button>
                    <Button className="flex-1 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold" onClick={confirmarRevincular}>Confirmar</Button>
                  </div>
                </div>
              )}
            </div>
        </DialogContent>
      </Dialog>

      {/* Modal Múltiples Opciones */}
      <Dialog open={modalMultiples} onOpenChange={(open) => {
        setModalMultiples(open)
        if (!open) resetear()
      }}>
        <DialogContent className="max-w-2xl overflow-hidden border-slate-700 bg-slate-900 p-0" showCloseButton={false}>
            <div className="p-6 border-b border-slate-800/60 bg-slate-800/50 flex justify-between items-start">
              <DialogHeader>
                  <DialogTitle className="font-black text-xl text-slate-100 flex items-center gap-2">
                    <BoxSelect className="w-5 h-5 text-indigo-400" /> Múltiples Presentaciones Encontradas
                  </DialogTitle>
                  <DialogDescription className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">
                      El código escaneado pertenece a {opcionesMultiples.length} presentaciones diferentes. Selecciona la correcta:
                  </DialogDescription>
              </DialogHeader>
              <button type="button" aria-label="Cerrar selección de presentación" onClick={() => {
                  setModalMultiples(false)
                  resetear()
              }} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {opcionesMultiples.map((opcion, idx) => (
                      <button
                          type="button"
                          key={idx} 
                          onClick={() => {
                              setModalMultiples(false)
                              iniciarProcesoSecuencial(opcion, codigo.trim())
                          }}
                          className="border border-slate-700/50 bg-slate-800/30 hover:bg-indigo-900/30 hover:border-indigo-500/50 p-4 rounded-2xl text-left transition-all hover:scale-[1.02] flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                          <div>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mb-2 inline-block ${
                                  opcion.tipo === 'EMPAQUE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700/50 text-slate-300'
                              }`}>
                                  {opcion.tipo}
                              </span>
                              <h4 className="font-black text-slate-200 text-sm leading-snug mb-1">{opcion.nombre_corto || opcion.descripcion_caja}</h4>
                              <p className="font-mono text-xs text-slate-400">SICAR: {opcion.clave_sicar}</p>
                          </div>
                          <div className="mt-3 flex justify-between items-end">
                              <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Factor</span>
                                  <span className="font-black text-lg text-indigo-300">{opcion.factor} pz</span>
                              </div>
                              <ArrowRight className="w-5 h-5 text-slate-600" />
                          </div>
                      </button>
                  ))}
               </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* Modal Gestionar Variantes (CRUD) */}
      <Dialog open={modalGestionVariantes} onOpenChange={(open) => {
        if (open) setModalGestionVariantes(true)
        else void cerrarModalGestion()
      }}>
        <DialogContent className="max-w-lg overflow-hidden border-slate-700 bg-slate-900 p-0" showCloseButton={false}>
            <div className="p-6 border-b border-slate-800/60 bg-slate-800/50 flex justify-between items-start">
              <DialogHeader>
              <DialogTitle className="font-black text-xl text-slate-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" /> Gestionar Variantes
              </DialogTitle>
              <DialogDescription className="sr-only">Selecciona, elimina o agrega variantes de presentación.</DialogDescription>
              </DialogHeader>
              <button type="button" aria-label="Cerrar gestión de variantes" onClick={cerrarModalGestion} className="text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
               <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-3">TUS VARIANTES ACTUALES</h4>
               {variantesLista.length === 0 ? (
                  <EmptyState title="Sin variantes" description="No has creado variantes para este código." className="min-h-24 py-4" />
               ) : (
                  <div className="space-y-2 mb-6 max-h-[30vh] overflow-y-auto">
                     {variantesLista.map(v => (
                        <div key={v.id} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                           <button type="button" className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => {
                               // Si le dan click al texto, que actue como seleccionar
                               const fakeMatch = {
                                   clave_sicar: datosProd.clave_sicar_final || datosProd.clave_sicar || codigo.trim(),
                                   clave_sicar_final: datosProd.clave_sicar_final,
                                   descripcion_caja: `CAJA: ${datosProd.descripcion_caja || ''} ➔ Variante: ${v.nombre}`,
                                   factor: v.factor,
                                   tipo: 'EMPAQUE',
                                   modo_preferido: datosProd.modo_preferido || 'VENTA'
                               };
                               iniciarProcesoSecuencial(fakeMatch, datosProd.codigo_leido || codigo.trim());
                               setModalGestionVariantes(false);
                           }}>
                              <span className="text-sm font-bold text-slate-200 hover:text-indigo-400 transition-colors">{v.nombre || 'Sin nombre'}</span>
                              <span className="ml-2 text-xs text-slate-400">({v.factor} pz)</span>
                           </button>
                           <div className="flex gap-2">
                               <button type="button" onClick={() => {
                                   // Boton seleccionar explicito
                                   const fakeMatch = {
                                       clave_sicar: datosProd.clave_sicar_final || datosProd.clave_sicar || codigo.trim(),
                                       clave_sicar_final: datosProd.clave_sicar_final,
                                       descripcion_caja: `CAJA: ${datosProd.descripcion_caja || ''} ➔ Variante: ${v.nombre}`,
                                       factor: v.factor,
                                       tipo: 'EMPAQUE',
                                       modo_preferido: datosProd.modo_preferido || 'VENTA'
                                   };
                                   iniciarProcesoSecuencial(fakeMatch, datosProd.codigo_leido || codigo.trim());
                                   setModalGestionVariantes(false);
                               }} className="text-indigo-400 hover:text-indigo-300 bg-indigo-400/10 hover:bg-indigo-400/20 px-2 py-1 rounded-md text-[10px] font-bold transition-colors uppercase tracking-widest">
                                  Seleccionar
                               </button>
                               <button type="button" onClick={() => eliminarVariante(v.id)} className="text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded-md text-[10px] font-bold transition-colors uppercase tracking-widest">
                                  Eliminar
                               </button>
                           </div>
                        </div>
                     ))}
                  </div>
               )}

               <div className="border-t border-slate-800 pt-6">
                  <h4 className="text-[10px] uppercase tracking-widest font-black text-indigo-400 mb-3">+ AÑADIR NUEVA VARIANTE</h4>
                  <div className="flex gap-3 items-end">
                     <div className="flex-1">
                         <label htmlFor="variant-name" className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                           Nombre (ej. Delgado 50)
                        </label>
                         <input id="variant-name" type="text"
                           value={nuevaVariante.nombre} onChange={e => setNuevaVariante({...nuevaVariante, nombre: e.target.value})}
                           className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:border-indigo-500 outline-none" 
                           placeholder="Nombre..."
                        />
                     </div>
                     <div className="w-24">
                         <label htmlFor="variant-factor" className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                           Factor
                        </label>
                         <input id="variant-factor" type="number"
                           value={nuevaVariante.factor} onChange={e => setNuevaVariante({...nuevaVariante, factor: e.target.value})}
                           className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-center text-slate-200 focus:border-indigo-500 outline-none" 
                           min="1"
                        />
                     </div>
                     <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg h-9 font-bold px-4" onClick={guardarNuevaVariante}>
                        Guardar
                     </Button>
                  </div>
               </div>
            </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
