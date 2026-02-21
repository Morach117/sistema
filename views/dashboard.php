<?php
// views/dashboard.php
session_start();
$nombreUsuario = $_SESSION['nombre'] ?? 'Usuario';

// 1. ZONA HORARIA (Arregla el problema de "Mañana")
date_default_timezone_set('America/Mexico_City');

// FUNCIÓN PARA FECHA EN ESPAÑOL
function fecha_hoy_espanol()
{
    $meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    $dia = date('d');
    $mes = $meses[date('n') - 1];
    $anio = date('Y');
    return "$dia $mes, $anio";
}
?>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<div class="p-6 md:p-10 animate-fade-in bg-base-200 h-screen overflow-y-auto pb-32">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-base-300">
        <div>
            <h1 class="text-3xl font-black text-gray-800">Hola, <?= htmlspecialchars($nombreUsuario) ?> 👋</h1>
            <p class="text-gray-500 font-medium mt-1">Este es el resumen de la captura de inventario en piso.</p>
        </div>
        <div class="badge badge-lg bg-indigo-50 text-indigo-700 border-indigo-200 gap-2 p-4 font-bold shadow-sm">
            <i class="bi bi-calendar-event"></i> <?= fecha_hoy_espanol() ?>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        
        <div class="card bg-white shadow-sm border border-base-300 overflow-hidden relative">
            <div class="absolute top-0 right-0 p-4 opacity-10 text-primary">
                <i class="bi bi-upc-scan text-7xl"></i>
            </div>
            <div class="card-body p-6 z-10">
                <h3 class="text-gray-500 font-bold text-xs uppercase tracking-wider mb-1">Movimientos Hoy</h3>
                <div class="text-4xl font-black text-gray-800" id="kpi-movimientos">...</div>
                <div class="text-xs font-semibold text-primary mt-2 flex items-center gap-1">
                    <i class="bi bi-activity"></i> En tiempo real
                </div>
            </div>
        </div>

        <div class="card bg-white shadow-sm border border-base-300 overflow-hidden relative col-span-1 md:col-span-2">
            <div class="absolute top-0 right-0 p-4 opacity-10 text-success">
                <i class="bi bi-box-seam text-7xl"></i>
            </div>
            <div class="card-body p-6 z-10">
                <h3 class="text-gray-500 font-bold text-xs uppercase tracking-wider mb-1">Volumen de Mercancía (Inventario)</h3>
                <div class="flex items-baseline gap-3 mt-1">
                    <div class="text-4xl font-black text-gray-800" id="kpi-cajas">...</div>
                    <span class="text-sm font-bold text-gray-400">cajas</span>
                    <span class="text-2xl text-gray-300 font-light px-2">|</span>
                    <div class="text-4xl font-black text-gray-800" id="kpi-sueltos">...</div>
                    <span class="text-sm font-bold text-gray-400">piezas sueltas</span>
                </div>
            </div>
        </div>

        <div class="card bg-white shadow-sm border border-base-300 overflow-hidden relative">
            <div class="absolute top-0 right-0 p-4 opacity-10 text-orange-500">
                <i class="bi bi-shop text-7xl"></i>
            </div>
            <div class="card-body p-6 z-10">
                <h3 class="text-gray-500 font-bold text-xs uppercase tracking-wider mb-1">Uso Interno Hoy</h3>
                <div class="text-4xl font-black text-gray-800" id="kpi-uso">...</div>
                <div class="text-xs font-semibold text-orange-500 mt-2 flex items-center gap-1">
                    <i class="bi bi-exclamation-triangle"></i> Gasto reportado
                </div>
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div class="card bg-white shadow-sm border border-base-300 lg:col-span-2 flex flex-col">
            <div class="card-body flex-grow-0 pb-0">
                <h2 class="card-title text-base font-black text-gray-700 border-b border-base-200 pb-2">
                    <i class="bi bi-bar-chart-line-fill text-primary mr-2"></i> Productividad Semanal
                </h2>
            </div>
            
            <div class="px-8 pt-4 pb-2">
                <div class="flex justify-between items-end mb-1">
                    <span class="text-xs font-bold text-gray-500 uppercase">Ritmo de Captura (Última hora)</span>
                    <span class="text-sm font-black text-indigo-600" id="kpi-ritmo">...</span>
                </div>
                <progress id="bar-ritmo" class="progress progress-primary w-full h-2" value="0" max="100"></progress>
            </div>

            <div class="card-body flex-grow pt-2">
                <div class="h-64 w-full">
                    <canvas id="myChart"></canvas>
                </div>
            </div>
        </div>

        <div class="card bg-white shadow-sm border border-base-300">
            <div class="card-body p-0 flex flex-col h-full">
                <div class="p-5 border-b border-base-200 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <h2 class="card-title text-base font-black text-gray-700">
                        <i class="bi bi-trophy-fill text-yellow-500 mr-2"></i> Top Capturistas (Hoy)
                    </h2>
                </div>

                <div class="flex-grow overflow-y-auto" id="lista-ranking">
                    <div class="flex flex-col items-center justify-center p-10 h-full text-gray-400">
                        <span class="loading loading-spinner text-primary mb-2"></span>
                        <span class="text-sm font-medium">Calculando...</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
    (() => {
        let chartInstance = null;

        window.DashboardAPI = {
            init: () => { DashboardAPI.cargarDatos(); },

            cargarDatos: () => {
                fetch('api/api_dashboard_captura.php')
                    .then(r => r.json())
                    .then(d => {
                        if (!d.success) return;

                        // Llenar Tarjetas KPI
                        document.getElementById('kpi-movimientos').innerText = d.kpis.movimientos_hoy;
                        document.getElementById('kpi-cajas').innerText = d.kpis.cajas_hoy;
                        document.getElementById('kpi-sueltos').innerText = d.kpis.sueltos_hoy;
                        document.getElementById('kpi-uso').innerText = d.kpis.uso_interno_hoy;

                        // Llenar Ritmo de Trabajo
                        const ritmo = d.kpis.ritmo_hora || 0;
                        document.getElementById('kpi-ritmo').innerText = ritmo + " items/hr";
                        
                        // Calculamos porcentaje de progreso (suponiendo que 200 items por hora es el 100% de eficiencia)
                        let porcentaje = (ritmo / 200) * 100; 
                        if(porcentaje > 100) porcentaje = 100;
                        document.getElementById('bar-ritmo').value = porcentaje;
                        
                        // Cambiamos el color de la barra si el ritmo es muy bajo
                        const barra = document.getElementById('bar-ritmo');
                        barra.className = 'progress w-full h-2 ' + (porcentaje < 20 ? 'progress-error' : (porcentaje < 50 ? 'progress-warning' : 'progress-primary'));

                        // Llenar Ranking de Empleados
                        DashboardAPI.renderizarRanking(d.ranking);

                        // Crear Gráfica de 7 Días
                        DashboardAPI.renderizarGrafica(d.chart);
                    })
                    .catch(e => console.error('Error dashboard:', e));
            },

            renderizarRanking: (ranking) => {
                const lista = document.getElementById('lista-ranking');
                if (!lista) return;
                lista.innerHTML = '';

                if (ranking.length === 0) {
                    lista.innerHTML = '<div class="text-center flex flex-col items-center justify-center p-12 opacity-40"><i class="bi bi-inbox text-5xl mb-3"></i><span class="font-bold italic">Nadie ha capturado hoy</span></div>';
                    return;
                }

                let html = '<div class="flex flex-col divide-y divide-base-200">';
                ranking.forEach((user, index) => {
                    let icon = `<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 border border-gray-300">${index + 1}</div>`;
                    if (index === 0) icon = `<div class="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center shadow-sm border border-yellow-300"><i class="bi bi-trophy-fill"></i></div>`;
                    if (index === 1) icon = `<div class="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center shadow-sm border border-gray-400"><i class="bi bi-award-fill"></i></div>`;
                    if (index === 2) icon = `<div class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm border border-orange-300"><i class="bi bi-award-fill"></i></div>`;

                    html += `
                    <div class="p-4 flex justify-between items-center hover:bg-base-50 transition-colors">
                        <div class="flex items-center gap-3">
                            ${icon}
                            <div class="font-bold text-gray-800 capitalize leading-tight">
                                ${user.nombre.toLowerCase()}
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="badge badge-primary badge-outline font-bold bg-white shadow-sm">${user.total_capturas} items</div>
                        </div>
                    </div>`;
                });
                html += '</div>';
                lista.innerHTML = html;
            },

            renderizarGrafica: (datos) => {
                const ctx = document.getElementById('myChart');
                if (!ctx) return;
                if (chartInstance) chartInstance.destroy();

                const labels = datos.map(d => d.fecha_corta);
                const valuesVenta = datos.map(d => d.venta);
                const valuesUso = datos.map(d => d.uso);

                chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Inventario (Venta)',
                                data: valuesVenta,
                                borderColor: '#4f46e5',
                                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4,
                                pointBackgroundColor: '#4f46e5',
                                pointBorderColor: '#fff',
                                pointBorderWidth: 2,
                                pointRadius: 4
                            },
                            {
                                label: 'Gasto (Uso)',
                                data: valuesUso,
                                borderColor: '#f97316',
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                tension: 0.4,
                                pointBackgroundColor: '#f97316',
                                pointRadius: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, font: { weight: 'bold' } } },
                            tooltip: { backgroundColor: 'rgba(255, 255, 255, 0.95)', titleColor: '#1f2937', bodyColor: '#1f2937', borderColor: '#e5e7eb', borderWidth: 1, padding: 10, titleFont: { size: 14 } }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#f3f4f6', drawBorder: false }, ticks: { font: { weight: '500' } } },
                            x: { grid: { display: false, drawBorder: false }, ticks: { font: { weight: 'bold' } } }
                        }
                    }
                });
            }
        };

        setTimeout(() => DashboardAPI.init(), 100);
    })();
</script>