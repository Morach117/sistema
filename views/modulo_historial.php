<?php
// views/modulo_historial.php
session_start();
require_once '../config/db.php';

// =====================================================================
// API INTEGRADA: BÚSQUEDA DE HISTORIAL DE PRECIOS
// =====================================================================
if (isset($_GET['buscar_codigo'])) {
    header('Content-Type: application/json');
    $q = trim($_GET['buscar_codigo']); // Limpiamos la entrada del usuario
    
    try {
        // Consulta Optimizada: SIN funciones en las columnas para aprovechar los ÍNDICES.
        // Se agrega LIMIT 150 para que el navegador no se congele con búsquedas genéricas.
        $sql = "SELECT 
                    hi.id,
                    hi.codigo_proveedor,
                    hi.descripcion_original,
                    hi.cantidad,
                    hi.costo_unitario,
                    hi.es_paquete,
                    hi.piezas_por_paquete,
                    hi.aplica_iva,
                    hi.aplica_descuento,
                    hi.aplica_descuento_manual,
                    COALESCE(NULLIF(TRIM(hi.clave_final), ''), NULLIF(TRIM(rcp.clave_sicar), ''), TRIM(hi.codigo_proveedor)) as sicar,
                    COALESCE(MAX(cp.descripcion), hi.descripcion_original) as desc_final,
                    hr.proveedor,
                    hr.fecha_carga,
                    hr.numero_remision
                FROM historial_items hi
                JOIN historial_remisiones hr ON hi.remision_id = hr.id
                LEFT JOIN rel_codigos_proveedor rcp ON hi.codigo_proveedor = rcp.codigo_proveedor
                LEFT JOIN cat_productos cp ON (
                    cp.clave_sicar = hi.clave_final OR 
                    cp.clave_sicar = rcp.clave_sicar OR 
                    cp.codigo_barras = hi.codigo_proveedor
                )
                WHERE hr.estado = 'FINALIZADO' 
                AND (hi.clave_final IS NULL OR hi.clave_final NOT IN ('FALTANTE', 'DEVOLUCION'))
                AND (
                    hi.clave_final = :q1 OR 
                    hi.clave_sicar = :q2 OR 
                    hi.codigo_proveedor = :q3 OR
                    rcp.clave_sicar = :q4 OR
                    cp.clave_sicar = :q5 OR
                    cp.codigo_barras = :q6 OR
                    hi.descripcion_original LIKE :qlike1 OR
                    cp.descripcion LIKE :qlike2
                )
                GROUP BY hi.id
                ORDER BY hr.fecha_carga DESC
                LIMIT 150";
        
        $stmt = $pdo->prepare($sql);
        
        $stmt->execute([
            ':q1' => $q, 
            ':q2' => $q, 
            ':q3' => $q, 
            ':q4' => $q, 
            ':q5' => $q, 
            ':q6' => $q, 
            ':qlike1' => '%' . $q . '%',
            ':qlike2' => '%' . $q . '%'
        ]);
        
        $resultados = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'data' => $resultados]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit; 
}
// =====================================================================
?>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
    
    #modulo-evolucion { font-family: 'Plus Jakarta Sans', sans-serif; }
    
    #modulo-evolucion ::-webkit-scrollbar { width: 6px; height: 6px; }
    #modulo-evolucion ::-webkit-scrollbar-track { background: transparent; }
    #modulo-evolucion ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    #modulo-evolucion ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    
    .glass-panel { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6); }
    .shadow-soft { box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); }
</style>

<div id="modulo-evolucion" class="h-full overflow-y-auto p-4 md:p-8 bg-slate-50 text-sm selection:bg-indigo-100 pb-20 custom-scrollbar">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 class="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
                    <i class="bi bi-graph-up-arrow text-white text-xl"></i>
                </div>
                Evolución de Precios
            </h1>
            <p class="text-sm text-slate-500 font-bold ml-1 mt-1 uppercase tracking-widest">Comparativa por Proveedor</p>
        </div>
    </div>

    <div class="glass-panel p-6 md:p-10 rounded-3xl shadow-soft mb-8 flex flex-col items-center justify-center relative overflow-hidden border border-slate-200">
        <div class="absolute top-0 right-0 w-64 h-64 bg-emerald-100 rounded-full blur-3xl opacity-50 -mr-20 -mt-20 pointer-events-none"></div>
        <div class="absolute bottom-0 left-0 w-40 h-40 bg-blue-100 rounded-full blur-3xl opacity-50 -ml-10 -mb-10 pointer-events-none"></div>
        
        <h2 class="text-xl font-black text-slate-700 mb-4 z-10 text-center tracking-tight">¿Qué producto deseas analizar?</h2>
        
        <div class="relative w-full max-w-2xl z-10 group">
            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i class="bi bi-upc-scan text-2xl text-slate-400 group-focus-within:text-emerald-500 transition-colors"></i>
            </div>
            <input type="text" id="inpBusquedaPrecios" 
                   class="w-full h-16 pl-14 pr-32 bg-white border-2 border-slate-200 rounded-2xl text-xl font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm placeholder:text-slate-300 placeholder:font-medium" 
                   placeholder="Ej. 880, 75023157..., Cuaderno..." autocomplete="off">
            <button onclick="EvolucionAPI.buscar()" class="absolute inset-y-2 right-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 rounded-xl transition-all active:scale-95 shadow-md shadow-emerald-200">
                Buscar
            </button>
        </div>
        <p class="text-[10px] text-slate-400 font-extrabold mt-4 z-10 uppercase tracking-widest"><i class="bi bi-info-circle mr-1"></i> Busca por Clave SICAR, Código de Proveedor o Descripción</p>
    </div>

    <div id="zonaResultadosEvolucion" class="hidden flex-col gap-6 opacity-0 transition-opacity duration-500">
        
        <div class="flex flex-col md:flex-row items-start md:items-center gap-3 mb-2">
            <div class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border border-indigo-200 shadow-sm" id="resSicar">SICAR: ---</div>
            <h3 class="text-2xl font-black text-slate-800 truncate tracking-tight" id="resDesc">Nombre del Producto</h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 shadow-lg shadow-emerald-200 text-white relative overflow-hidden transform hover:-translate-y-1 transition-transform">
                <i class="bi bi-trophy absolute right-4 top-4 text-5xl opacity-20"></i>
                <p class="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">El Mejor Precio Histórico</p>
                <div class="text-4xl font-black tracking-tight" id="cardMejorPrecio">$0.00</div>
                <div class="mt-4 bg-black/10 rounded-xl px-3 py-2 inline-block">
                    <p class="text-xs font-bold tracking-wide" id="cardMejorProv"><i class="bi bi-shop mr-1"></i> ---</p>
                </div>
            </div>
            
            <div class="glass-panel rounded-3xl p-6 shadow-soft border border-slate-200 relative transform hover:-translate-y-1 transition-transform">
                <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center absolute right-6 top-6"><i class="bi bi-clock-history text-lg"></i></div>
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Última Compra</p>
                <div class="text-3xl font-black tracking-tight text-slate-800" id="cardUltimoPrecio">$0.00</div>
                <div class="mt-4 text-sm font-bold text-slate-500 flex items-center gap-2" id="cardUltimaFecha"><i class="bi bi-calendar-event"></i> ---</div>
            </div>
            
            <div class="glass-panel rounded-3xl p-6 shadow-soft border border-slate-200 relative transform hover:-translate-y-1 transition-transform">
                <div class="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center absolute right-6 top-6"><i class="bi bi-bar-chart-line-fill text-lg"></i></div>
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Variación Precio</p>
                <div class="text-3xl font-black tracking-tight text-slate-800" id="cardVariacion">---</div>
                <div class="mt-4 text-xs font-bold text-slate-400" id="cardVariacionTexto">Análisis de tendencia</div>
            </div>
        </div>

        <h4 class="text-lg font-black text-slate-700 mt-6 tracking-tight"><i class="bi bi-activity mr-2 text-indigo-500"></i> Gráfica de Tendencia</h4>
        <div class="glass-panel shadow-soft rounded-3xl p-4 md:p-6 border border-slate-200">
            <div class="relative w-full h-[300px]">
                <canvas id="graficaEvolucion"></canvas>
            </div>
        </div>

        <h4 class="text-lg font-black text-slate-700 mt-6 tracking-tight"><i class="bi bi-shop mr-2 text-indigo-500"></i> Último Precio por Proveedor</h4>
        <div class="glass-panel shadow-soft rounded-3xl overflow-hidden border border-slate-200">
            <div class="overflow-x-auto p-2">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-slate-100/80 text-slate-500 text-[10px] uppercase font-extrabold tracking-wider rounded-xl">
                        <tr>
                            <th class="p-4 border-b border-slate-200 rounded-tl-xl">Proveedor</th>
                            <th class="p-4 border-b border-slate-200 text-center">Última Fecha</th>
                            <th class="p-4 border-b border-slate-200 text-right">Costo Base</th>
                            <th class="p-4 border-b border-slate-200 text-center">Desglose Extra</th>
                            <th class="p-4 border-b border-slate-200 text-right rounded-tr-xl">Costo Neto Unitario</th>
                        </tr>
                    </thead>
                    <tbody id="tablaComparativaProv" class="text-sm text-slate-700 font-medium divide-y divide-slate-100">
                    </tbody>
                </table>
            </div>
        </div>

        <h4 class="text-lg font-black text-slate-700 mt-6 tracking-tight"><i class="bi bi-list-nested mr-2 text-indigo-500"></i> Historial Completo de Entradas</h4>
        <div class="glass-panel shadow-soft rounded-3xl overflow-hidden border border-slate-200 mb-10">
            <div class="overflow-x-auto p-2 max-h-96 custom-scrollbar">
                <table class="w-full text-left border-collapse relative">
                    <thead class="bg-white text-slate-500 text-[10px] uppercase font-extrabold tracking-wider sticky top-0 z-10 shadow-sm rounded-xl">
                        <tr>
                            <th class="p-4">Fecha</th>
                            <th class="p-4">Factura</th>
                            <th class="p-4">Proveedor</th>
                            <th class="p-4 text-center">Cant.</th>
                            <th class="p-4 text-right">Costo Neto Unitario</th>
                        </tr>
                    </thead>
                    <tbody id="tablaHistorialCompleto" class="text-sm text-slate-700 font-medium divide-y divide-slate-100">
                    </tbody>
                </table>
            </div>
        </div>

    </div>
    
    <div id="emptyEvolucion" class="hidden flex-col items-center justify-center mt-20 text-slate-400 opacity-60">
        <i class="bi bi-inboxes text-7xl mb-4"></i>
        <span class="font-bold text-lg tracking-tight">No se encontró historial para este código.</span>
        <p class="text-sm mt-2">Verifica que el producto haya sido procesado y FINALIZADO previamente.</p>
    </div>

</div>

<script>
(() => {
    const fmtMoney = (n) => parseFloat(n).toLocaleString('es-MX', {style:'currency', currency:'MXN'});
    const inpBusqueda = document.getElementById('inpBusquedaPrecios');
    const zonaResultados = document.getElementById('zonaResultadosEvolucion');
    const emptyResultados = document.getElementById('emptyEvolucion');
    
    if(inpBusqueda) setTimeout(() => inpBusqueda.focus(), 200);

    window.EvolucionAPI = {
        
        buscar: () => {
            const q = inpBusqueda.value.trim();
            if(!q) return;

            // Ocultar resultados previos para efecto fluido
            zonaResultados.classList.add('opacity-0');
            emptyResultados.classList.add('hidden');
            emptyResultados.classList.remove('flex');

            fetch(`views/modulo_historial.php?buscar_codigo=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if(res.success && res.data.length > 0) {
                        EvolucionAPI.procesarDatos(res.data);
                    } else {
                        zonaResultados.classList.add('hidden');
                        zonaResultados.classList.remove('flex');
                        emptyResultados.classList.remove('hidden');
                        emptyResultados.classList.add('flex');
                    }
                })
                .catch(e => {
                    console.error(e);
                    Swal.fire('Error', 'Hubo un problema de conexión', 'error');
                });
        },

        procesarDatos: (datos) => {
            document.getElementById('resSicar').innerText = `SICAR: ${datos[0].sicar}`;
            document.getElementById('resDesc').innerText = datos[0].desc_final || datos[0].descripcion_original;

            let historialHTML = '';
            let provMap = {}; 
            let mejorPrecio = Infinity;
            let mejorProv = '';
            
            let labelsGrafica = [];
            let dataGrafica = [];
            let provsGrafica = [];

            datos.forEach(item => {
                let costo = parseFloat(item.costo_unitario);
                let tieneIva = (item.aplica_iva == 1);
                let tieneDescXML = (item.aplica_descuento == 1);
                let esPaq = (item.es_paquete == 1);
                let pzas = parseFloat(item.piezas_por_paquete) || 1;
                let provNombre = (item.proveedor || 'MANUAL').toUpperCase();

                let checkDesc = false;
                if (provNombre.includes('PAOLA') || provNombre.includes('OPERADORA')) checkDesc = true;
                else if (provNombre.includes('TONY')) checkDesc = tieneDescXML;
                else if (provNombre.includes('SINDESC')) checkDesc = false;

                if (item.aplica_descuento_manual !== null) {
                    checkDesc = (item.aplica_descuento_manual == 1);
                }

                if (tieneIva) costo *= 1.16;
                if (checkDesc) costo *= 0.95; 

                let costoPieza = costo;
                if (esPaq && pzas > 1) costoPieza = costo / pzas; 

                let fechaCorta = item.fecha_carga.split(' ')[0]; 

                labelsGrafica.push(fechaCorta);
                dataGrafica.push(costoPieza);
                provsGrafica.push(provNombre);

                if (!provMap[provNombre]) {
                    provMap[provNombre] = {
                        fecha: fechaCorta,
                        costoBase: parseFloat(item.costo_unitario),
                        iva: tieneIva,
                        desc: checkDesc,
                        esPaq: esPaq,
                        pzas: pzas,
                        costoPiezaNeto: costoPieza
                    };
                }

                if (costoPieza < mejorPrecio && costoPieza > 0) {
                    mejorPrecio = costoPieza;
                    mejorProv = provNombre;
                }

                let badgeTipo = esPaq ? `<span class="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold ml-2 border border-indigo-100">CAJA (${pzas})</span>` : `<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold ml-2 border border-slate-200">PIEZA</span>`;
                
                historialHTML += `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                        <td class="p-4 font-bold text-slate-500">${fechaCorta}</td>
                        <td class="p-4 font-mono text-xs"><span class="bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">#${item.numero_remision}</span></td>
                        <td class="p-4 font-bold text-slate-700">${provNombre}</td>
                        <td class="p-4 text-center font-black text-slate-800">${item.cantidad} ${badgeTipo}</td>
                        <td class="p-4 text-right font-black text-emerald-600 text-base">${fmtMoney(costoPieza)} <span class="text-[9px] text-slate-400 font-extrabold block leading-none tracking-widest mt-0.5">COSTO/PZ</span></td>
                    </tr>
                `;
            });

            document.getElementById('cardMejorPrecio').innerText = fmtMoney(mejorPrecio);
            document.getElementById('cardMejorProv').innerHTML = `<i class="bi bi-shop mr-1"></i> ${mejorProv}`;
            document.getElementById('cardUltimoPrecio').innerText = fmtMoney(dataGrafica[0]);
            document.getElementById('cardUltimaFecha').innerHTML = `<i class="bi bi-calendar-check mr-1"></i> ${labelsGrafica[0]}`;

            if (dataGrafica.length > 1) {
                let pActual = dataGrafica[0];
                let pAnterior = dataGrafica[1]; 
                if (pActual > pAnterior) {
                    let dif = pActual - pAnterior;
                    document.getElementById('cardVariacion').innerHTML = `<span class="text-red-500 flex items-center gap-1"><i class="bi bi-arrow-up-right"></i> ${fmtMoney(dif)}</span>`;
                    document.getElementById('cardVariacionTexto').innerText = 'Subió de precio respecto a la compra anterior';
                } else if (pActual < pAnterior) {
                    let dif = pAnterior - pActual;
                    document.getElementById('cardVariacion').innerHTML = `<span class="text-emerald-500 flex items-center gap-1"><i class="bi bi-arrow-down-right"></i> ${fmtMoney(dif)}</span>`;
                    document.getElementById('cardVariacionTexto').innerText = 'Bajó de precio respecto a la compra anterior';
                } else {
                    document.getElementById('cardVariacion').innerHTML = `<span class="text-slate-400 flex items-center gap-1"><i class="bi bi-dash"></i> Estable</span>`;
                    document.getElementById('cardVariacionTexto').innerText = 'Mismo precio que la compra anterior';
                }
            } else {
                document.getElementById('cardVariacion').innerHTML = `<span class="text-slate-400 text-lg">---</span>`;
                document.getElementById('cardVariacionTexto').innerText = 'Se requiere más de 1 compra para comparar';
            }

            let compHTML = '';
            for (const [prov, info] of Object.entries(provMap)) {
                let iconProv = (prov === 'TONY') ? '🐯' : (prov.includes('PAOLA') ? '📄' : (prov === 'OPTIVOSA' ? '👓' : '📦'));
                let badgesDetalle = '';
                if(info.iva) badgesDetalle += `<span class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-md text-[9px] font-black mr-1">+IVA</span>`;
                if(info.desc) badgesDetalle += `<span class="bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-md text-[9px] font-black mr-1">-5% DTO</span>`;
                if(info.esPaq) badgesDetalle += `<span class="bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-md text-[9px] font-black">Caja de ${info.pzas}</span>`;
                if(badgesDetalle === '') badgesDetalle = `<span class="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Directo Neto</span>`;

                let isMejor = (info.costoPiezaNeto === mejorPrecio) ? 'bg-emerald-50/60 border-l-4 border-l-emerald-400' : 'border-l-4 border-l-transparent';
                let corona = (info.costoPiezaNeto === mejorPrecio) ? `<i class="bi bi-star-fill text-emerald-500 ml-2" title="Mejor Opción"></i>` : '';

                compHTML += `
                    <tr class="hover:bg-slate-50 transition-colors ${isMejor}">
                        <td class="p-4 font-black text-slate-700 flex items-center gap-2"><span class="text-lg bg-white w-8 h-8 rounded-lg shadow-sm flex items-center justify-center border border-slate-100">${iconProv}</span> ${prov} ${corona}</td>
                        <td class="p-4 text-center font-bold text-slate-500 text-xs">${info.fecha}</td>
                        <td class="p-4 text-right font-bold text-slate-600">${fmtMoney(info.costoBase)}</td>
                        <td class="p-4 text-center">${badgesDetalle}</td>
                        <td class="p-4 text-right font-black text-xl text-indigo-600">${fmtMoney(info.costoPiezaNeto)}</td>
                    </tr>
                `;
            }
            document.getElementById('tablaComparativaProv').innerHTML = compHTML;
            document.getElementById('tablaHistorialCompleto').innerHTML = historialHTML;

            labelsGrafica.reverse();
            dataGrafica.reverse();
            provsGrafica.reverse();

            if (window.graficaEvo) { window.graficaEvo.destroy(); }
            
            const ctx = document.getElementById('graficaEvolucion').getContext('2d');
            window.graficaEvo = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labelsGrafica,
                    datasets: [{
                        label: 'Costo Neto por Pieza',
                        data: dataGrafica,
                        borderColor: '#10b981', 
                        backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                        borderWidth: 3,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#10b981',
                        pointBorderWidth: 3,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            titleFont: { family: 'Plus Jakarta Sans', size: 13 },
                            bodyFont: { family: 'Plus Jakarta Sans', size: 14, weight: 'bold' },
                            padding: 12,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null) label += fmtMoney(context.parsed.y);
                                    let prov = provsGrafica[context.dataIndex];
                                    return [label, 'Prov: ' + prov];
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: false,
                            grid: { color: 'rgba(0, 0, 0, 0.05)' },
                            ticks: { callback: function(value) { return '$' + value; } }
                        }
                    }
                }
            });

            // Mostrar el contenedor y hacer Fade-In suave
            zonaResultados.classList.remove('hidden');
            zonaResultados.classList.add('flex');
            
            setTimeout(() => {
                zonaResultados.classList.remove('opacity-0');
                zonaResultados.classList.add('opacity-100');
            }, 50);
        }
    };
})();
</script>