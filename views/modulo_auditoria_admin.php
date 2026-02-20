<?php
// views/modulo_auditoria_captura.php
session_start();

// --- CORRECCIÓN DE HORA ---
// Forzamos la zona horaria a México para que no marque "mañana" si trabajas tarde
date_default_timezone_set('America/Mexico_City'); 

if (!isset($_SESSION['rol']) || $_SESSION['rol'] !== 'admin') {
    echo "<script>window.cargarVista('dashboard');</script>";
    exit();
}
?>

<div class="p-6 h-full flex flex-col animate-fade-in bg-base-200">

    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div class="flex items-center gap-3">
            <div class="p-3 bg-purple-600 rounded-lg text-white shadow-lg shadow-purple-200">
                <i class="bi bi-list-check text-2xl"></i>
            </div>
            <div>
                <h1 class="text-2xl font-black text-gray-800">Auditoría de Captura</h1>
                <p class="text-sm text-gray-500">Gestión de inventario para Papelería Yazmín</p>
            </div>
        </div>

        <div class="flex flex-wrap gap-4 bg-white p-3 rounded-2xl shadow-sm border border-base-300 items-center">
            <div class="form-control px-2 border-r border-base-200 mr-2">
                <label class="label cursor-pointer gap-3">
                    <span class="label-text font-bold text-xs uppercase text-gray-500">¿Sumar Estante?</span>
                    <input type="checkbox" id="swIncluirFisico" class="toggle toggle-primary toggle-sm"
                        onchange="AuditoriaCapturaAPI.renderizarDatos()" />
                </label>
            </div>

            <div class="join">
                <input type="date" id="filtroFecha" class="input input-sm input-bordered join-item"
                    value="<?= date('Y-m-d') ?>" onchange="AuditoriaCapturaAPI.cargarLista()">
                <button class="btn btn-sm btn-primary join-item" onclick="AuditoriaCapturaAPI.cargarLista()">
                    <i class="bi bi-arrow-clockwise"></i>
                </button>
            </div>
        </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">

        <div
            class="w-full lg:w-3/4 flex flex-col bg-white rounded-xl shadow-lg border border-purple-100 h-full relative">
            <div class="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                <span class="font-bold text-gray-600 text-sm uppercase tracking-wider">Movimientos Registrados</span>
                <span class="badge badge-ghost font-mono" id="lblTotalMovimientos">0 regs</span>
            </div>

            <div class="flex-grow overflow-auto">
                <table class="table table-pin-rows w-full text-sm">
                    <thead class="bg-gray-100 text-gray-600 font-bold uppercase text-[10px]">
                        <tr>
                            <th>Hora / Usuario</th>
                            <th>Producto Escaneado</th>
                            <th class="text-center">Destino</th>
                            <th class="text-center text-blue-600">En Estante</th>
                            <th class="text-center text-secondary">Cajas</th>
                            <th class="text-right pr-6">Ajuste Final (pz)</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="tablaCapturas"></tbody>
                </table>
            </div>
        </div>

        <div class="w-full lg:w-1/4 flex flex-col gap-4">
            <div class="card bg-white shadow-md border border-gray-200">
                <div class="card-body p-5">
                    <h3 class="card-title text-sm text-gray-400 uppercase tracking-widest mb-4">Resumen de Ajuste</h3>
                    <div class="flex justify-between items-end mb-2">
                        <span class="text-gray-600 font-bold text-xs uppercase">Total piezas:</span>
                        <span class="text-3xl font-black text-purple-600" id="lblGranTotal">0.00</span>
                    </div>
                    <div class="divider my-1"></div>
                    <p class="text-[10px] text-gray-400 leading-tight" id="lblLeyendaCalculo">Mostrando solo desdoble de
                        cajas.</p>
                </div>
            </div>

            <button onclick="AuditoriaCapturaAPI.exportarExcel()"
                class="btn btn-lg btn-success text-white shadow-xl shadow-green-200 w-full hover:scale-[1.02] transition-transform">
                <i class="bi bi-file-earmark-spreadsheet-fill text-xl"></i>
                DESCARGAR EXCEL
            </button>
        </div>
    </div>
</div>

<script>
window.AuditoriaCapturaAPI = {
    dataCache: [],

    init: () => {
        AuditoriaCapturaAPI.cargarLista();
    },

    cargarLista: () => {
        const fecha = document.getElementById('filtroFecha').value;
        const tbody = document.getElementById('tablaCapturas');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-10"><span class="loading loading-dots loading-lg text-purple-600"></span></td></tr>';

        const fd = new FormData();
        fd.append('fecha', fecha);

        fetch('api/api_listar_capturas_admin.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    AuditoriaCapturaAPI.dataCache = d.data;
                    AuditoriaCapturaAPI.renderizarDatos();
                } else {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-error p-10">Error al cargar datos</td></tr>';
                }
            });
    },

    renderizarDatos: () => {
        const tbody = document.getElementById('tablaCapturas');
        const incluirFisico = document.getElementById('swIncluirFisico').checked;
        const leyenda = document.getElementById('lblLeyendaCalculo');

        tbody.innerHTML = '';

        if (AuditoriaCapturaAPI.dataCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-10 text-gray-400 italic">Sin movimientos</td></tr>';
            document.getElementById('lblGranTotal').innerText = "0.00";
            document.getElementById('lblTotalMovimientos').innerText = "0 regs";
            return;
        }

        let sumaGlobal = 0;
        let pendientes = 0; // Contador de lo que falta por bajar
        
        leyenda.innerText = incluirFisico ? "Sumando Cajas + Existencia (Solo Pendientes)" : "Mostrando solo desdoble (Solo Pendientes)";

        AuditoriaCapturaAPI.dataCache.forEach(row => {
            const bultos = parseFloat(row.bultos || 0);
            const factor = parseFloat(row.factor || 1);
            const pzEnEstante = parseFloat(row.existencia || 0);
            const cajasNetas = (bultos * factor);
            const ajusteFila = incluirFisico ? (cajasNetas + pzEnEstante) : cajasNetas;
            
            const yaExportado = (row.exportado == 1);

            // LOGICA DE SUMA: Solo sumamos al total visible si NO ha sido exportado
            if (!yaExportado) {
                sumaGlobal += ajusteFila;
                pendientes++;
            }

            // ESTILOS VISUALES
            let rowClass = 'border-b border-gray-100 last:border-0 transition-colors ';
            let textClass = '';
            let iconStatus = '';

            if (yaExportado) {
                // ESTILO DESACTIVADO (Gris, Opaco, Tachado sutilmente)
                rowClass += 'bg-gray-100 opacity-60 grayscale';
                textClass = 'text-gray-400 decoration-slate-400';
                iconStatus = '<i class="bi bi-check-all text-green-600 text-lg" title="Ya exportado"></i>';
            } else {
                // ESTILO ACTIVO (Normal)
                rowClass += 'hover:bg-indigo-50 group';
                textClass = 'text-gray-700';
                
                // Distinción Uso vs Venta
                if (row.tipo_uso === 'CONSUMO') {
                    rowClass += ' bg-orange-50 hover:bg-orange-100';
                    iconStatus = '<span class="badge badge-warning badge-sm text-white">USO</span>';
                } else if (factor > 1 || bultos > 0) {
                    iconStatus = '<span class="badge badge-primary badge-sm">CAJA</span>';
                } else {
                    iconStatus = '<span class="badge badge-ghost badge-sm">PIEZA</span>';
                }
            }

            tbody.innerHTML += `
                <tr class="${rowClass}">
                    <td class="${textClass}">
                        <div class="font-bold">${row.hora}</div>
                        <div class="text-[9px] uppercase opacity-50">${row.usuario}</div>
                    </td>
                    <td class="${textClass}">
                        <div class="font-bold leading-tight">${row.descripcion}</div>
                        <div class="text-[10px] font-mono opacity-70">${row.clave_sicar}</div>
                    </td>
                    <td class="text-center">${iconStatus}</td>
                    <td class="text-center font-bold ${yaExportado ? 'text-gray-400' : (incluirFisico ? 'text-blue-600' : 'text-gray-300')}">
                        ${pzEnEstante}
                    </td>
                    <td class="text-center font-bold ${yaExportado ? 'text-gray-400' : 'text-secondary'}">
                        ${row.bultos} <span class="text-[9px] opacity-60 block">x${row.factor}</span>
                    </td>
                    <td class="text-right font-black ${yaExportado ? 'text-gray-400' : 'text-gray-800'} pr-6">
                        ${ajusteFila.toLocaleString()}
                    </td>
                    <td class="text-right">
                        ${!yaExportado ? 
                            `<button onclick="AuditoriaCapturaAPI.borrar(${row.id})" class="btn btn-xs btn-circle btn-ghost text-error opacity-0 group-hover:opacity-100 transition-all"><i class="bi bi-trash-fill"></i></button>` 
                            : ''}
                    </td>
                </tr>`;
        });

        // Actualizamos contadores
        document.getElementById('lblTotalMovimientos').innerText = pendientes + " pendientes / " + AuditoriaCapturaAPI.dataCache.length + " total";
        
        // El total grande ahora solo muestra lo que falta por bajar
        document.getElementById('lblGranTotal').innerText = sumaGlobal.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        
        // Cambiar color del total si ya no hay nada pendiente
        if(sumaGlobal === 0 && AuditoriaCapturaAPI.dataCache.length > 0){
             document.getElementById('lblGranTotal').className = "text-3xl font-black text-green-500";
             document.getElementById('lblGranTotal').innerText = "✓ AL DÍA";
        } else {
             document.getElementById('lblGranTotal').className = "text-3xl font-black text-purple-600";
        }
    },

    exportarExcel: () => {
        const fecha = document.getElementById('filtroFecha').value;
        const incluirFisico = document.getElementById('swIncluirFisico').checked ? '1' : '0';

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'api/generar_sicar_captura.php'; // Este archivo YA tiene el filtro 'AND exportado = 0'

        const i1 = document.createElement('input'); i1.type = 'hidden'; i1.name = 'fecha'; i1.value = fecha;
        const i2 = document.createElement('input'); i2.type = 'hidden'; i2.name = 'incluir_fisico'; i2.value = incluirFisico;
        
        form.appendChild(i1); form.appendChild(i2);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
        
        // Recargar la tabla automáticamente después de 2 segundos para verlos ya grises
        setTimeout(() => {
            AuditoriaCapturaAPI.cargarLista();
            Swal.fire({
                toast: true, position: 'top-end', icon: 'success', 
                title: 'Exportación completada', showConfirmButton: false, timer: 2000
            });
        }, 2000);
    },

    borrar: (id) => {
        Swal.fire({
            title: '¿Borrar registro?', text: 'No se puede deshacer.', icon: 'warning', showCancelButton: true
        }).then(r => {
            if (r.isConfirmed) {
                const fd = new FormData(); fd.append('id', id);
                fetch('api/api_captura_eliminar.php', { method: 'POST', body: fd })
                    .then(() => AuditoriaCapturaAPI.cargarLista());
            }
        });
    }
};

AuditoriaCapturaAPI.init();
</script>