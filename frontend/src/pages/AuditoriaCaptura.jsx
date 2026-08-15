import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from '@/lib/api'
import { Card } from '@/components/ui/card'
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
import { FileSpreadsheet, Calendar, ScanBarcode, Box, CheckCircle2, ShieldAlert, Trash2, History, Download, X } from 'lucide-react'
import Swal from 'sweetalert2'

const getLocalToday = () => {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const localDate = new Date(d.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().slice(0, 10)
}

export default function AuditoriaCaptura() {
  const queryClient = useQueryClient()
  const historyDialogTriggerRef = useRef(null)
  const logsDialogTriggerRef = useRef(null)
  const [fecha, setFecha] = useState(getLocalToday())
  const [swIncluirFisico, setSwIncluirFisico] = useState(false)
  const [filtroEstatus, setFiltroEstatus] = useState('todos') // 'todos', 'pendientes', 'exportados'
  const [modalHistorial, setModalHistorial] = useState(false)
  const [modalLogsSistema, setModalLogsSistema] = useState(false)

  const { data: registros, isLoading } = useQuery({
    queryKey: ['admin_captura', fecha],
    queryFn: async () => {
      const res = await axios.get(`/api/captura/admin_list?fecha=${fecha}`)
      return res.data.data
    }
  })

  const { data: historialDescargas, isLoading: loadingDescargas } = useQuery({
    queryKey: ['historial_descargas'],
    queryFn: async () => {
      const res = await axios.get('/api/captura/historial_descargas')
      return res.data.data
    },
    enabled: modalHistorial
  })

  const { data: logsSistema, isLoading: loadingLogs } = useQuery({
    queryKey: ['logs_sistema'],
    queryFn: async () => {
      const res = await axios.get('/api/captura/logs_sistema')
      return res.data.data
    },
    enabled: modalLogsSistema
  })

  const exportMutation = useMutation({
    mutationFn: (ids) => axios.post('/api/captura/marcar_exportados', { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin_captura', fecha])
    }
  })

  const descartarMutation = useMutation({
    mutationFn: (id) => axios.post('/api/captura/eliminar', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin_captura', fecha])
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Registro descartado', showConfirmButton: false, timer: 1500 })
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Error al descartar', 'error')
  })

  const handleDescartar = (id) => {
    Swal.fire({
      title: '¿Descartar captura?',
      text: 'Esta captura no será tomada en cuenta para la exportación ni el inventario.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, descartar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        descartarMutation.mutate(id)
      }
    })
  }

  // Computed
  const registrosProcesados = useMemo(() => {
    if (!registros) return []
    return registros.map(r => {
      const bultos = parseFloat(r.cantidad_bultos) || 0
      const factor = parseFloat(r.factor) || 1
      const fisico = parseFloat(r.existencia) || 0
      
      const cajasTotal = bultos * factor
      const total = swIncluirFisico ? (cajasTotal + fisico) : cajasTotal

      return {
        ...r,
        cajasTotal,
        fisico,
        totalCalculado: total
      }
    })
  }, [registros, swIncluirFisico])

  const registrosFiltrados = useMemo(() => {
    if (filtroEstatus === 'pendientes') return registrosProcesados.filter(r => r.exportado === 0)
    if (filtroEstatus === 'exportados') return registrosProcesados.filter(r => r.exportado === 1)
    return registrosProcesados
  }, [registrosProcesados, filtroEstatus])

  const exportarAExcel = async (lista, titulo, marcar = false) => {
    if (!lista || lista.length === 0) {
      Swal.fire('Atención', 'No hay datos para exportar.', 'info')
      return
    }

    const fileName = `${titulo}_${fecha}.xls`

    // Agrupar y desdoblar con la misma lógica de SICAR
    const listaFinal = {}
    
    lista.forEach(r => {
        const codigoCaja = r.codigo ? r.codigo.trim() : ''
        const codigoPieza = r.clave_sicar ? r.clave_sicar.trim() : ''
        const bultos = parseFloat(r.cantidad_bultos) || 0
        const factor = parseFloat(r.factor) || 1
        const existenciaFisica = parseFloat(r.existencia) || 0
        const tipoUso = r.tipo_uso

        if (tipoUso === 'CONSUMO') {
            const totalConsumido = (bultos * factor) + existenciaFisica
            if (totalConsumido > 0) {
                listaFinal[codigoPieza] = (listaFinal[codigoPieza] || 0) - totalConsumido
            }
        } else {
            // A. Manejo de Cajas (Desdoble)
            if (factor > 1 && bultos > 0) {
                listaFinal[codigoCaja] = (listaFinal[codigoCaja] || 0) - bultos
                listaFinal[codigoPieza] = (listaFinal[codigoPieza] || 0) + (bultos * factor)
            } 
            // B. Manejo de bultos directos (si no es caja compuesta)
            else if (factor <= 1 && bultos > 0) {
                listaFinal[codigoPieza] = (listaFinal[codigoPieza] || 0) + bultos
            }

            // C. Manejo de Sueltos (Fisico)
            if (swIncluirFisico && existenciaFisica > 0) {
                listaFinal[codigoPieza] = (listaFinal[codigoPieza] || 0) + existenciaFisica
            }
        }
    })

    let xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>\n`
    xml += `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">\n`
    xml += `    <Styles>\n`
    xml += `        <Style ss:ID="sHeader"><Font ss:Bold="1" ss:Color="#FFFFFF" /><Interior ss:Color="#4f46e5" ss:Pattern="Solid" /><Alignment ss:Horizontal="Center" /></Style>\n`
    xml += `        <Style ss:ID="sTexto"><NumberFormat ss:Format="@" /></Style>\n`
    xml += `    </Styles>\n`
    xml += `    <Worksheet ss:Name="Ajuste">\n`
    xml += `        <Table>\n`
    xml += `            <Row>\n`
    xml += `                <Cell ss:StyleID="sHeader"><Data ss:Type="String">Clave</Data></Cell>\n`
    xml += `                <Cell ss:StyleID="sHeader"><Data ss:Type="String">Cantidad</Data></Cell>\n`
    xml += `            </Row>\n`

    for (const [clave, cant] of Object.entries(listaFinal)) {
        if (cant === 0) continue;
        const safeClave = String(clave).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        xml += `            <Row>\n`
        xml += `                <Cell ss:StyleID="sTexto"><Data ss:Type="String">${safeClave}</Data></Cell>\n`
        xml += `                <Cell><Data ss:Type="Number">${cant}</Data></Cell>\n`
        xml += `            </Row>\n`
    }
    
    xml += `        </Table>\n`
    xml += `    </Worksheet>\n`
    xml += `</Workbook>`

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)

    // Registrar en el historial de BD
    try {
      await axios.post('/api/captura/registrar_descarga', {
        fecha_captura: fecha,
        tipo_exportacion: marcar ? 'PENDIENTES_SICAR' : 'RESPALDO_COMPLETO',
        total_registros: lista.length,
        nombre_archivo: fileName
      })
      queryClient.invalidateQueries(['historial_descargas'])
    } catch (e) {
      console.error('Error registrando log de descarga:', e)
    }

    if (marcar) {
      const ids = lista.map(p => p.id)
      exportMutation.mutate(ids)
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Excel generado y marcados como exportados', showConfirmButton: false, timer: 2000 })
    } else {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Excel de respaldo generado (SICAR)', showConfirmButton: false, timer: 2000 })
    }
  }

  const handleExportarPendientes = () => {
    const pendientes = registrosProcesados.filter(r => r.exportado === 0)
    exportarAExcel(pendientes, `Auditoria_Pendientes_Dia_${fecha}_SICAR`, true)
  }

  const handleExportarTodosLosPendientes = async () => {
    try {
      const res = await axios.get('/api/captura/admin_list?todos_pendientes=1')
      const todosPendientes = res.data.data || []
      if (todosPendientes.length === 0) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'No hay registros pendientes acumulados de ninguna fecha', showConfirmButton: false, timer: 2500 })
        return
      }
      exportarAExcel(todosPendientes, `Auditoria_TODOS_Los_Pendientes_Acumulados_SICAR`, true)
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'Error al obtener pendientes acumulados', 'error')
    }
  }

  const handleReexportarTodo = () => {
    exportarAExcel(registrosProcesados, `Auditoria_Historial_Dia_${fecha}`, false)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-screen-2xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            Auditoría de Captura
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-2 ml-1">Centro de Control de Inventario</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800/60 shadow-inner">
          <Button
            ref={logsDialogTriggerRef}
            onClick={() => setModalLogsSistema(true)}
            variant="outline"
            className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold gap-2 text-xs h-9 px-3"
          >
            <i className="bi bi-journal-text text-indigo-400"></i> Ver Logs del Sistema
          </Button>

          <Button
            ref={historyDialogTriggerRef}
            onClick={() => setModalHistorial(true)}
            variant="outline"
            className="border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-bold gap-2 text-xs h-9 px-3"
          >
            <History className="w-4 h-4 text-purple-400" /> Historial de Descargas
          </Button>

          <div className="flex items-center px-3 gap-2 border-l border-slate-700/50">
            <Calendar className="w-4 h-4 text-slate-500" />
            <label htmlFor="audit-date" className="sr-only">Fecha de auditoría</label>
            <input 
              id="audit-date"
              type="date" 
              className="bg-transparent text-sm font-bold text-slate-200 focus:outline-none"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </div>
          
          <label htmlFor="include-physical-stock" className="flex items-center cursor-pointer select-none px-3 gap-2 border-l border-slate-700/50">
            <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${swIncluirFisico ? 'text-indigo-400' : 'text-slate-500'}`}>
              ¿Sumar Estante Físico?
            </span>
            <input 
              id="include-physical-stock"
              type="checkbox" 
              className="toggle toggle-indigo toggle-sm"
              checked={swIncluirFisico} 
              onChange={e => setSwIncluirFisico(e.target.checked)} 
            />
          </label>
        </div>
      </div>

      <Card className="glass-panel border-slate-800/60 bg-slate-900/40 shadow-sm flex flex-col min-h-[500px]">
        <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-950/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-black text-slate-200">Registros del Día</h3>
            <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border border-slate-700">
              {registrosFiltrados?.length || 0} Movimientos
            </span>

            {/* Filtros de estatus */}
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px] font-black uppercase ml-2">
              <button 
                type="button"
                onClick={() => setFiltroEstatus('todos')} 
                className={`px-2.5 py-1 rounded transition-colors ${filtroEstatus === 'todos' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Todos ({registrosProcesados?.length || 0})
              </button>
              <button 
                type="button"
                onClick={() => setFiltroEstatus('pendientes')} 
                className={`px-2.5 py-1 rounded transition-colors ${filtroEstatus === 'pendientes' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Pendientes ({registrosProcesados?.filter(r=>r.exportado===0).length || 0})
              </button>
              <button 
                type="button"
                onClick={() => setFiltroEstatus('exportados')} 
                className={`px-2.5 py-1 rounded transition-colors ${filtroEstatus === 'exportados' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Exportados ({registrosProcesados?.filter(r=>r.exportado===1).length || 0})
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleReexportarTodo}
              disabled={!registrosProcesados || registrosProcesados.length === 0}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 font-bold gap-2 text-xs"
              title="Descargar historial completo de este día como respaldo"
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
              Re-descargar Día (Respaldo)
            </Button>
            <Button 
              onClick={handleExportarPendientes} 
              disabled={!registrosProcesados || registrosProcesados.filter(r=>r.exportado===0).length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 text-xs"
              title="Exportar únicamente los pendientes del día seleccionado"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Pendientes del Día
            </Button>
            <Button 
              onClick={handleExportarTodosLosPendientes} 
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold gap-2 shadow-lg shadow-purple-500/20 active:scale-95 text-xs"
              title="Exportar todos los pendientes acumulados de cualquier fecha (Histórico)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar TODOS los Pendientes (Histórico)
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto p-2">
          <table className="w-full text-left text-sm border-collapse min-w-[800px]">
            <thead className="bg-slate-950/80 sticky top-0 z-10 text-slate-500 text-[10px] uppercase font-black tracking-widest backdrop-blur-md">
              <tr>
                <th className="p-4 border-b border-slate-800/60">Estatus</th>
                <th className="p-4 border-b border-slate-800/60">Hora / Usuario</th>
                <th className="p-4 border-b border-slate-800/60 w-1/3">Producto</th>
                <th className="p-4 border-b border-slate-800/60 text-center">Desglose</th>
                <th className="p-4 border-b border-slate-800/60 text-center bg-indigo-500/5 text-indigo-400">Total SICAR</th>
                <th className="p-4 border-b border-slate-800/60 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr><td colSpan="6"><LoadingState label="Cargando auditoría…" /></td></tr>
              ) : registrosFiltrados?.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-20">
                    <Box className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No hay capturas para los filtros seleccionados.</p>
                  </td>
                </tr>
              ) : (
                registrosFiltrados.map((r) => {
                  const esConsumo = r.tipo_uso === 'CONSUMO'
                  const esExportado = r.exportado === 1
                  return (
                    <tr key={r.id} className={`hover:bg-slate-800/30 transition-colors ${esExportado ? 'opacity-50 grayscale' : ''}`}>
                      <td className="p-4 align-middle">
                        {esExportado ? (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> Exportado
                          </span>
                        ) : esConsumo ? (
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 w-fit">
                            Consumo Interno
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-800 px-2 py-1 rounded-md border border-slate-700 w-fit">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="font-bold text-slate-300 text-xs">{new Date(r.fecha).toLocaleTimeString()}</div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">👤 {r.capturista || 'Sistema'}</div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="font-black text-slate-200 text-sm leading-snug tracking-tight mb-1">{r.descripcion_cache || r.descripcion_actual || 'Producto Manual'}</div>
                        <div className="flex gap-2">
                          <span className="bg-slate-950/50 text-slate-400 border border-slate-700/50 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 w-fit">
                            <ScanBarcode className="w-3 h-3" /> {r.codigo}
                          </span>
                          <span className="text-[9px] text-slate-500 font-bold border border-slate-700/50 px-1.5 py-0.5 rounded">SICAR: {r.clave_sicar}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex items-center justify-center gap-3 text-xs">
                          <div className="text-center" title="Bultos x Factor">
                            <div className="font-mono text-indigo-400 font-bold">{r.cajasTotal}</div>
                            <div className="text-[8px] uppercase tracking-widest text-slate-500">Cajas</div>
                          </div>
                          <span className="text-slate-600 font-black">+</span>
                          <div className={`text-center transition-all ${swIncluirFisico ? '' : 'opacity-30'}`} title="Existencia en Estante">
                            <div className={`font-mono font-bold ${swIncluirFisico ? 'text-emerald-400' : 'text-slate-500'}`}>{r.fisico}</div>
                            <div className="text-[8px] uppercase tracking-widest text-slate-500">Repisa</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 align-middle text-center bg-indigo-500/5">
                        <div className="font-black text-2xl text-indigo-400 drop-shadow-md">
                          {r.totalCalculado}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl w-8 h-8"
                          onClick={() => handleDescartar(r.id)}
                          title="Descartar captura"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Historial de Descargas */}
      <Dialog open={modalHistorial} onOpenChange={setModalHistorial}>
        <DialogContent
          className="glass-panel max-h-[85dvh] max-w-4xl overflow-hidden border-purple-500/30 bg-slate-950 p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            historyDialogTriggerRef.current?.focus()
          }}
          showCloseButton={false}
        >
            <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-purple-500/20 p-2 rounded-xl text-purple-400">
                  <History className="w-6 h-6" />
                </div>
                <DialogHeader>
                  <DialogTitle className="text-lg font-black text-slate-100 uppercase tracking-tight">Historial de Descargas (Logs)</DialogTitle>
                  <DialogDescription className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registro de archivos exportados e imprevistos</DialogDescription>
                </DialogHeader>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                aria-label="Cerrar historial de descargas"
                onClick={() => setModalHistorial(false)}
                className="text-slate-400 hover:text-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-3 border-b border-slate-800">Fecha Descarga</th>
                    <th className="p-3 border-b border-slate-800">Fecha Captura</th>
                    <th className="p-3 border-b border-slate-800">Usuario</th>
                    <th className="p-3 border-b border-slate-800">Tipo</th>
                    <th className="p-3 border-b border-slate-800 text-center">Registros</th>
                    <th className="p-3 border-b border-slate-800 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loadingDescargas ? (
                    <tr><td colSpan="6"><LoadingState compact label="Cargando descargas…" className="py-12" /></td></tr>
                  ) : !historialDescargas || historialDescargas.length === 0 ? (
                    <tr><td colSpan="6"><EmptyState title="Sin registros de descargas previas" className="min-h-32" /></td></tr>
                  ) : (
                    historialDescargas.map(log => (
                      <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-xs text-slate-300">
                          {new Date(log.fecha_descarga).toLocaleString()}
                        </td>
                        <td className="p-3 font-mono text-xs text-purple-400 font-bold">
                          {log.fecha_captura}
                        </td>
                        <td className="p-3 text-xs text-slate-300 font-bold">
                          👤 {log.capturista || 'Admin'}
                        </td>
                        <td className="p-3 text-xs">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                            log.tipo_exportacion === 'PENDIENTES_SICAR' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          }`}>
                            {log.tipo_exportacion}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-black text-slate-100 text-base">
                          {log.total_registros}
                        </td>
                        <td className="p-3 text-right">
                          <Button 
                            size="sm"
                            variant="outline"
                            className="bg-slate-900 border-slate-700 hover:bg-purple-600 hover:text-white text-purple-300 text-xs font-bold gap-1 rounded-xl"
                            onClick={() => {
                              setFecha(log.fecha_captura)
                              setModalHistorial(false)
                              setTimeout(() => handleReexportarTodo(), 300)
                            }}
                          >
                            <Download className="w-3.5 h-3.5" /> Re-descargar
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
        </DialogContent>
      </Dialog>

      {/* Modal Logs del Sistema */}
      <Dialog open={modalLogsSistema} onOpenChange={setModalLogsSistema}>
        <DialogContent
          className="glass-panel max-h-[85dvh] max-w-5xl overflow-hidden border-indigo-500/30 bg-slate-950 p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            logsDialogTriggerRef.current?.focus()
          }}
          showCloseButton={false}
        >
            <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/20 p-2 rounded-xl text-indigo-400">
                  <i className="bi bi-journal-text text-xl"></i>
                </div>
                <DialogHeader>
                  <DialogTitle className="text-lg font-black text-slate-100 uppercase tracking-tight">Logs del Sistema</DialogTitle>
                  <DialogDescription className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Historial completo de acciones</DialogDescription>
                </DialogHeader>
              </div>
              <Button 
                variant="ghost" size="icon" 
                aria-label="Cerrar logs del sistema"
                onClick={() => setModalLogsSistema(false)}
                className="text-slate-400 hover:text-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-0 overflow-y-auto flex-1 custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-4 pl-6 border-b border-slate-800">Fecha / Hora</th>
                    <th className="p-4 border-b border-slate-800">Usuario</th>
                    <th className="p-4 border-b border-slate-800 text-center">Módulo</th>
                    <th className="p-4 border-b border-slate-800 text-center">Acción</th>
                    <th className="p-4 pr-6 border-b border-slate-800">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loadingLogs ? (
                    <tr><td colSpan="5"><LoadingState compact label="Cargando logs…" className="py-12" /></td></tr>
                  ) : !logsSistema || logsSistema.length === 0 ? (
                    <tr><td colSpan="5"><EmptyState title="Sin logs registrados" className="min-h-32" /></td></tr>
                  ) : (
                    logsSistema.map(log => {
                      let colorAccion = 'text-slate-400'
                      if(log.accion === 'LOGIN') colorAccion = 'text-blue-400'
                      if(log.accion === 'VINCULAR') colorAccion = 'text-emerald-400'
                      if(log.accion === 'REVINCULAR') colorAccion = 'text-orange-400'
                      if(log.accion === 'DESCARGAR') colorAccion = 'text-purple-400'

                      return (
                        <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                          <td className="p-4 pl-6 font-mono font-bold text-xs text-slate-400">
                            {new Date(log.fecha).toLocaleString()}
                          </td>
                          <td className="p-4 text-xs text-indigo-300 font-bold">
                            {log.usuario || 'Sistema'}
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                              {log.modulo}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${colorAccion}`}>
                              {log.accion}
                            </span>
                          </td>
                          <td className="p-4 pr-6 text-xs text-slate-300">
                            {log.detalles}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
