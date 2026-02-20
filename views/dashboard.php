<?php
// views/dashboard.php
session_start();
$nombreUsuario = $_SESSION['nombre'] ?? 'Usuario';

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

<div class="p-6 md:p-10 animate-fade-in">

    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 class="text-3xl font-bold text-base-content">Hola, <?= htmlspecialchars($nombreUsuario) ?> 👋</h1>
            <p class="text-base-content/60 mt-1">Aquí tienes el resumen de tu inventario hoy.</p>
        </div>
        <div class="badge badge-lg badge-outline gap-2 p-4 font-medium">
            <i class="bi bi-calendar-event"></i> <?= fecha_hoy_espanol() ?>
        </div>
    </div>

    <div class="stats stats-vertical lg:stats-horizontal shadow w-full bg-base-100 mb-8 border border-base-200">

        <div class="stat">
            <div class="stat-figure text-warning">
                <i class="bi bi-clock-history text-3xl"></i>
            </div>
            <div class="stat-title">Pendientes</div>
            <div class="stat-value text-warning" id="kpi-pendientes">...</div>
            <div class="stat-desc">Tareas por realizar</div>
        </div>

        <div class="stat">
            <div class="stat-figure text-success">
                <i class="bi bi-check-circle text-3xl"></i>
            </div>
            <div class="stat-title">Finalizadas Hoy</div>
            <div class="stat-value text-success" id="kpi-finalizadas">...</div>
            <div class="stat-desc">Tareas completadas</div>
        </div>

        <div class="stat">
            <div class="stat-figure text-primary">
                <i class="bi bi-box-seam text-3xl"></i>
            </div>
            <div class="stat-title">Items Procesados</div>
            <div class="stat-value text-primary" id="kpi-items">...</div>
            <div class="stat-desc">Total acumulado</div>
        </div>

    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div class="card bg-base-100 shadow-sm border border-base-200 lg:col-span-2">
            <div class="card-body">
                <h2 class="card-title text-base font-bold mb-4">
                    <i class="bi bi-bar-chart-line mr-2"></i> Rendimiento Semanal
                </h2>
                <div class="h-64 w-full">
                    <canvas id="myChart"></canvas>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body p-0">
                <div class="p-4 border-b border-base-200 flex justify-between items-center">
                    <h2 class="card-title text-base font-bold">
                        <i class="bi bi-activity mr-2"></i> Actividad Reciente
                    </h2>
                    <a onclick="if(window.cargarVista) window.cargarVista('modulo_facturas')"
                        class="link link-primary text-xs no-underline hover:underline cursor-pointer">Ver todo</a>
                </div>

                <div class="flex flex-col divide-y divide-base-200" id="lista-actividad">
                    <div class="flex justify-center p-8">
                        <span class="loading loading-spinner text-primary"></span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
    /**
     * MÓDULO DASHBOARD (Professional Module Pattern)
     */
    (() => {
        // Variable privada para guardar la instancia de la gráfica y destruirla si es necesario
        let chartInstance = null;

        // API Pública
        window.DashboardAPI = {

            init: () => {
                DashboardAPI.cargarDatos();
            },

            cargarDatos: () => {
                fetch('api/api_dashboard.php')
                    .then(response => response.json())
                    .then(data => {
                        if (!data.success) return;

                        // 1. KPIs
                        DashboardAPI.actualizarKPI('kpi-pendientes', data.kpis.pendientes);
                        DashboardAPI.actualizarKPI('kpi-finalizadas', data.kpis.finalizadas_hoy);
                        const totalFmt = new Intl.NumberFormat('es-MX').format(data.kpis.total_items);
                        DashboardAPI.actualizarKPI('kpi-items', totalFmt);

                        // 2. Lista
                        DashboardAPI.renderizarActividad(data.activity);

                        // 3. Gráfica
                        DashboardAPI.renderizarGrafica(data.chart);
                    })
                    .catch(error => console.error('Error dashboard:', error));
            },

            actualizarKPI: (id, valor) => {
                const el = document.getElementById(id);
                if (el) el.innerText = valor;
            },

            renderizarActividad: (activity) => {
                const lista = document.getElementById('lista-actividad');
                if (!lista) return;

                lista.innerHTML = '';

                if (activity.length === 0) {
                    lista.innerHTML = '<div class="text-center p-6 opacity-50 text-sm">No hay actividad reciente</div>';
                    return;
                }

                activity.forEach(item => {
                    let badgeClass = item.estado === 'FINALIZADO' ? 'badge-success text-white' : 'badge-warning';
                    let badgeText = item.estado === 'FINALIZADO' ? 'OK' : 'PEND';

                    // Formatear fecha
                    let fechaFmt = item.fecha_carga;
                    try {
                        let fechaObj = new Date(item.fecha_carga);
                        fechaFmt = fechaObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                    } catch (e) { }

                    lista.innerHTML += `
                <div class="p-4 flex justify-between items-center hover:bg-base-200/50 transition-colors">
                    <div>
                        <div class="font-bold text-sm text-base-content">${item.numero_remision}</div>
                        <div class="text-xs opacity-60 mt-1 capitalize">
                            ${fechaFmt} • <span class="font-semibold">${item.items} items</span>
                        </div>
                    </div>
                    <div class="badge ${badgeClass} badge-sm">${badgeText}</div>
                </div>`;
                });
            },

            renderizarGrafica: (datos) => {
                const ctx = document.getElementById('myChart');
                if (!ctx) return;

                // Importante: Destruir gráfica anterior para evitar superposiciones en SPAs
                if (chartInstance) {
                    chartInstance.destroy();
                }

                // Tema
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
                const textColor = isDark ? '#a6adbb' : '#1f2937';

                // Datos
                const labels = datos.map(d => {
                    try {
                        let f = new Date(d.fecha + 'T00:00:00');
                        return f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                    } catch (e) { return d.fecha; }
                });
                const values = datos.map(d => d.total);

                // Crear nueva instancia
                chartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Facturas Cargadas',
                            data: values,
                            backgroundColor: '#FF69B4', // Rosa Yazmín
                            borderRadius: 4,
                            barThickness: 20
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: (context) => context[0].label.toUpperCase()
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { stepSize: 1, color: textColor },
                                grid: { color: gridColor }
                            },
                            x: {
                                ticks: { color: textColor },
                                grid: { display: false }
                            }
                        }
                    }
                });
            }
        };

        // Auto-iniciar
        DashboardAPI.init();
    })();
</script>