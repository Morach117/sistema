import { useState } from 'react'
import axios from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, Search, Calendar, DollarSign, Award, ArrowUpRight, ArrowDownRight, Minus, Package, Tag } from 'lucide-react'
import Swal from 'sweetalert2'

export default function EvolucionPrecios() {
  const [busqueda, setBusqueda] = useState('')
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(false)

  const fmtMoney = (n) => parseFloat(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

  const procesarResultados = (raw) => {
    if (!raw || raw.length === 0) return null

    let provMap = {}
    let mejorPrecio = Infinity
    let mejorProv = ''
    let grafica = []

    // raw viene ordenado por fecha desc
    const rawReversed = [...raw].reverse() // chronological for chart

    raw.forEach(item => {
      let costo = parseFloat(item.costo_unitario)
      let tieneIva = (item.aplica_iva == 1)
      let tieneDescXML = (item.aplica_descuento == 1)
      let esPaq = (item.es_paquete == 1)
      let pzas = parseFloat(item.piezas_por_paquete) || 1
      let provNombre = (item.proveedor || 'MANUAL').toUpperCase()

      let checkDesc = false
      if (provNombre.includes('PAOLA') || provNombre.includes('OPERADORA')) checkDesc = true
      else if (provNombre.includes('TONY')) checkDesc = tieneDescXML
      else if (provNombre.includes('SINDESC')) checkDesc = false

      if (item.aplica_descuento_manual !== null) {
          checkDesc = (item.aplica_descuento_manual == 1)
      }

      if (tieneIva) costo *= 1.16
      if (checkDesc) costo *= 0.95

      let costoPieza = costo
      if (esPaq && pzas > 1) costoPieza = costo / pzas

      let fechaCorta = item.fecha_carga.split(' ')[0]

      if (!provMap[provNombre]) {
          provMap[provNombre] = {
              fecha: fechaCorta,
              costoBase: parseFloat(item.costo_unitario),
              iva: tieneIva,
              desc: checkDesc,
              esPaq, pzas,
              costoPiezaNeto: costoPieza
          }
      }

      if (costoPieza < mejorPrecio && costoPieza > 0) {
          mejorPrecio = costoPieza
          mejorProv = provNombre
      }
    })

    rawReversed.forEach(item => {
       // repeat logic to build chart data sequentially
       let costo = parseFloat(item.costo_unitario)
       let provNombre = (item.proveedor || 'MANUAL').toUpperCase()
       let tieneIva = (item.aplica_iva == 1)
       let checkDesc = false
       if (provNombre.includes('PAOLA') || provNombre.includes('OPERADORA')) checkDesc = true
       else if (provNombre.includes('TONY')) checkDesc = (item.aplica_descuento == 1)
       if (item.aplica_descuento_manual !== null) checkDesc = (item.aplica_descuento_manual == 1)

       if (tieneIva) costo *= 1.16
       if (checkDesc) costo *= 0.95
       let costoPieza = costo
       if (item.es_paquete == 1 && item.piezas_por_paquete > 1) costoPieza = costo / parseFloat(item.piezas_por_paquete)
       
       grafica.push({
           fecha: item.fecha_carga.split(' ')[0],
           costo: costoPieza,
           proveedor: provNombre
       })
    })

    const ultimos2 = raw.slice(0, 2)
    let variacion = { tipo: 'estable', val: 0, text: 'Mismo precio que la compra anterior' }
    if (grafica.length > 1) {
       const pActual = grafica[grafica.length - 1].costo
       const pAnterior = grafica[grafica.length - 2].costo
       if (pActual > pAnterior) variacion = { tipo: 'subio', val: pActual - pAnterior, text: 'Subió respecto a compra anterior' }
       else if (pActual < pAnterior) variacion = { tipo: 'bajo', val: pAnterior - pActual, text: 'Bajó respecto a compra anterior' }
    } else if (grafica.length === 1) {
       variacion = { tipo: 'estable', val: 0, text: 'Requiere 2 compras para comparar' }
    }

    return {
       header: { sicar: raw[0].sicar, desc: raw[0].desc_final || raw[0].descripcion_original },
       mejor: { precio: mejorPrecio, prov: mejorProv },
       ultimo: { precio: grafica[grafica.length - 1]?.costo || 0, fecha: grafica[grafica.length - 1]?.fecha || '' },
       variacion,
       provMap: Object.entries(provMap).map(([k,v]) => ({nombre: k, ...v})).sort((a,b) => a.costoPiezaNeto - b.costoPiezaNeto),
       grafica,
       historial: raw.map(r => {
           let costo = parseFloat(r.costo_unitario)
           let provNombre = (r.proveedor || 'MANUAL').toUpperCase()
           let tieneIva = (r.aplica_iva == 1)
           let checkDesc = false
           if (provNombre.includes('PAOLA') || provNombre.includes('OPERADORA')) checkDesc = true
           else if (provNombre.includes('TONY')) checkDesc = (r.aplica_descuento == 1)
           if (r.aplica_descuento_manual !== null) checkDesc = (r.aplica_descuento_manual == 1)

           if (tieneIva) costo *= 1.16
           if (checkDesc) costo *= 0.95
           let costoPieza = costo
           if (r.es_paquete == 1 && r.piezas_por_paquete > 1) costoPieza = costo / parseFloat(r.piezas_por_paquete)

           return {
               fecha: r.fecha_carga.split(' ')[0],
               factura: r.numero_remision,
               prov: provNombre,
               cantidad: r.cantidad,
               esPaq: r.es_paquete == 1,
               pzas: r.piezas_por_paquete,
               costoFinal: costoPieza
           }
       })
    }
  }

  const handleBuscar = async (e) => {
    e?.preventDefault()
    if (!busqueda.trim()) return
    setLoading(true)
    try {
      const res = await axios.get('/api/evolucion-precios', { params: { buscar_codigo: busqueda } })
      if (res.data.success && res.data.data.length > 0) {
        setDatos(procesarResultados(res.data.data))
      } else {
        setDatos(null)
        Swal.fire({ toast: true, position: 'top', icon: 'info', title: 'Sin resultados', showConfirmButton: false, timer: 2000 })
      }
    } catch (error) {
      Swal.fire('Error', 'Problema al buscar', 'error')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-screen-2xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3 tracking-tight">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
              <TrendingUp className="w-6 h-6" />
            </div>
            Evolución de Precios
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2 ml-1">Comparativa por Proveedor</p>
        </div>
      </div>

      <Card className="glass-panel overflow-hidden relative shadow-sm border-slate-700/50">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
        <CardContent className="p-8 relative z-10 flex flex-col items-center justify-center">
          <h2 className="text-xl font-black text-slate-200 mb-4 text-center tracking-tight">¿Qué producto deseas analizar?</h2>
          <form onSubmit={handleBuscar} className="relative w-full max-w-2xl group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text" 
              className="w-full h-16 pl-14 pr-32 bg-slate-950/50 border border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 rounded-2xl text-xl font-bold text-slate-200 focus:outline-none shadow-inner transition-all placeholder:text-slate-600"
              placeholder="Ej. 880, 75023157..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <Button type="submit" className="absolute right-2 top-2 h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all" disabled={loading}>
              {loading ? <span className="loading loading-spinner"></span> : 'Buscar'}
            </Button>
          </form>
          <p className="text-[10px] text-slate-500 font-black mt-4 uppercase tracking-widest">
            Busca por Clave SICAR, Código o Descripción
          </p>
        </CardContent>
      </Card>

      {datos && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-indigo-500/20 shadow-inner">
              SICAR: {datos.header.sicar}
            </div>
            <h3 className="text-2xl font-black text-slate-200 tracking-tight truncate">
              {datos.header.desc}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass-panel bg-gradient-to-br from-emerald-600/20 to-teal-600/10 border-emerald-500/20 shadow-lg shadow-emerald-500/10 overflow-hidden relative group">
              <Award className="absolute right-4 top-4 w-12 h-12 opacity-20 text-emerald-400 group-hover:scale-110 transition-transform" />
              <CardContent className="p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/80 mb-1">El Mejor Precio</p>
                <div className="text-4xl font-black tracking-tight text-white">{fmtMoney(datos.mejor.precio)}</div>
                <div className="mt-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-3 py-2 inline-block">
                  <p className="text-xs font-bold tracking-wide flex items-center gap-2 text-emerald-200">
                    <Package className="w-3 h-3" /> {datos.mejor.prov}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-slate-800/60 bg-slate-900/40 shadow-sm group">
              <CardContent className="p-6 relative">
                <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center absolute right-6 top-6 shadow-inner">
                  <Calendar className="w-5 h-5" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Última Compra</p>
                <div className="text-3xl font-black tracking-tight text-slate-200">{fmtMoney(datos.ultimo.precio)}</div>
                <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> {datos.ultimo.fecha}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-slate-800/60 bg-slate-900/40 shadow-sm group">
              <CardContent className="p-6 relative">
                <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center absolute right-6 top-6 shadow-inner">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Variación Precio</p>
                <div className="text-3xl font-black tracking-tight flex items-center gap-2">
                  {datos.variacion.tipo === 'subio' ? <span className="text-red-400 flex items-center drop-shadow-md"><ArrowUpRight className="w-6 h-6 mr-1" />{fmtMoney(datos.variacion.val)}</span> :
                   datos.variacion.tipo === 'bajo' ? <span className="text-emerald-400 flex items-center drop-shadow-md"><ArrowDownRight className="w-6 h-6 mr-1" />{fmtMoney(datos.variacion.val)}</span> :
                   <span className="text-slate-500 flex items-center"><Minus className="w-6 h-6 mr-1" /> Estable</span>}
                </div>
                <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{datos.variacion.text}</div>
              </CardContent>
            </Card>
          </div>

          {/* Gráfica */}
          <h4 className="text-lg font-black text-slate-100 mt-6 tracking-tight flex items-center gap-2">
            <TrendingUp className="text-indigo-400 w-5 h-5" /> Tendencia
          </h4>
          <Card className="glass-panel border-slate-800/60 shadow-sm bg-slate-900/40">
            <CardContent className="p-6">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={datos.grafica}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} stroke="#94a3b8" />
                    <XAxis dataKey="fecha" stroke="#64748b" className="text-xs font-bold" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `$${v}`} stroke="#64748b" className="text-xs font-bold" tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '0.75rem', fontWeight: 'bold', color: '#f1f5f9', backdropFilter: 'blur(12px)' }}
                      formatter={(v, n, props) => [fmtMoney(v), `Prov: ${props.payload.proveedor}`]} 
                    />
                    <Line type="monotone" dataKey="costo" stroke="#34d399" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#0f172a' }} activeDot={{ r: 6, stroke: '#34d399', strokeWidth: 2, fill: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Proveedores */}
          <h4 className="text-lg font-black text-slate-100 mt-6 tracking-tight flex items-center gap-2">
            <Package className="text-indigo-400 w-5 h-5" /> Último Precio por Proveedor
          </h4>
          <Card className="glass-panel border-slate-800/60 shadow-sm overflow-hidden bg-slate-900/40">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/80 border-b border-slate-800/60 text-slate-500 text-[10px] uppercase font-black tracking-widest backdrop-blur-md">
                  <tr>
                    <th className="px-6 py-4">Proveedor</th>
                    <th className="px-6 py-4 text-center">Última Fecha</th>
                    <th className="px-6 py-4 text-right">Costo Base</th>
                    <th className="px-6 py-4 text-center">Detalles</th>
                    <th className="px-6 py-4 text-right text-indigo-400">Costo Neto Unitario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {datos.provMap.map((p, i) => (
                    <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${p.costoPiezaNeto === datos.mejor.precio ? 'bg-emerald-500/5' : ''}`}>
                      <td className="px-6 py-4 font-black text-slate-200 flex items-center gap-2">
                        {p.nombre} 
                        {p.costoPiezaNeto === datos.mejor.precio && <Award className="w-4 h-4 text-emerald-400" />}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-400">{p.fecha}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-300">{fmtMoney(p.costoBase)}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex gap-1 justify-center">
                          {p.iva && <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-[9px] font-black uppercase shadow-inner">IVA</span>}
                          {p.desc && <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-[9px] font-black uppercase shadow-inner">-5% DTO</span>}
                          {p.esPaq && <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[9px] font-black uppercase shadow-inner">Caja {p.pzas}</span>}
                          {!p.iva && !p.desc && !p.esPaq && <span className="text-[10px] text-slate-500 font-bold">Directo Neto</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-xl text-indigo-400">
                        {fmtMoney(p.costoPiezaNeto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Historial */}
          <h4 className="text-lg font-black text-slate-100 mt-6 tracking-tight flex items-center gap-2">
            <Tag className="text-indigo-400 w-5 h-5" /> Historial de Entradas
          </h4>
          <Card className="glass-panel border-slate-800/60 shadow-sm overflow-hidden mb-10 bg-slate-900/40">
            <div className="overflow-x-auto max-h-96 custom-scrollbar">
              <table className="w-full text-left text-sm relative">
                <thead className="bg-slate-900/90 border-b border-slate-800/60 text-slate-500 text-[10px] uppercase font-black tracking-widest sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Factura</th>
                    <th className="px-6 py-4">Proveedor</th>
                    <th className="px-6 py-4 text-center">Cant.</th>
                    <th className="px-6 py-4 text-right">Costo Neto Unitario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {datos.historial.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-500">{h.fecha}</td>
                      <td className="px-6 py-4 font-mono text-xs"><span className="bg-slate-950/50 border border-slate-700/50 text-slate-400 px-2 py-1 rounded shadow-inner">{h.factura}</span></td>
                      <td className="px-6 py-4 font-bold text-slate-200">{h.prov}</td>
                      <td className="px-6 py-4 text-center font-black text-slate-300">
                        {h.cantidad} {h.esPaq ? <span className="text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-1 py-0.5 rounded ml-1 shadow-inner">CAJA ({h.pzas})</span> : <span className="text-[9px] bg-slate-800/50 border border-slate-700 text-slate-400 px-1 py-0.5 rounded ml-1">PIEZA</span>}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-emerald-400">
                        {fmtMoney(h.costoFinal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

        </div>
      )}

    </div>
  )
}
