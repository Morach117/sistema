<?php
// views/modulo_historial_facturas.php
session_start();
require_once '../config/db.php';

// --- FILTROS PHP (Servidor) ---
$filtro_estado = $_GET['estado'] ?? '';
$filtro_prov   = $_GET['proveedor'] ?? '';
$fecha_inicio  = $_GET['f_inicio'] ?? date('Y-m-01');
$fecha_fin     = $_GET['f_fin'] ?? date('Y-m-d');

// 1. Obtener Proveedores
$stmtProv = $pdo->query("SELECT DISTINCT proveedor FROM historial_remisiones WHERE proveedor IS NOT NULL AND proveedor != '' ORDER BY proveedor ASC");
$proveedores = $stmtProv->fetchAll(PDO::FETCH_COLUMN);

// 2. Consulta Principal (Traemos hasta 1000 registros, la paginación la hace JS)
$sql = "SELECT hr.*, 
        (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id) as total_items
        FROM historial_remisiones hr 
        WHERE DATE(hr.fecha_carga) BETWEEN ? AND ?";

$params = [$fecha_inicio, $fecha_fin];

if (!empty($filtro_estado)) {
    $sql .= " AND hr.estado = ?";
    $params[] = $filtro_estado;
}

if (!empty($filtro_prov)) {
    $sql .= " AND hr.proveedor = ?";
    $params[] = $filtro_prov;
}

$sql .= " ORDER BY hr.fecha_carga DESC LIMIT 1000"; 

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$remisiones = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>

<div class="p-4 md:p-8 min-h-screen bg-base-200 font-sans text-sm">
    
    <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-6">
        <div>
            <h1 class="text-3xl font-black text-gray-800 flex items-center gap-3">
                <span class="bg-primary/10 text-primary p-2 rounded-lg"><i class="bi bi-folder2-open"></i></span>
                Historial de Recepciones
            </h1>
            <p class="text-sm text-gray-500 font-medium ml-1">Consulta y auditoría</p>
        </div>
        
        <form action="index.php" method="GET" class="bg-white p-3 rounded-2xl shadow-sm border border-base-200 flex flex-wrap gap-3 w-full xl:w-auto items-end">
            
            <input type="hidden" name="modulo" value="historial_facturas"> 
            
            <div class="form-control w-1/2 md:w-auto">
                <label class="label-text text-[10px] font-bold uppercase text-gray-400 ml-1">Desde</label>
                <input type="date" name="f_inicio" value="<?= $fecha_inicio ?>" class="input input-sm input-bordered rounded-lg">
            </div>
            <div class="form-control w-1/2 md:w-auto">
                <label class="label-text text-[10px] font-bold uppercase text-gray-400 ml-1">Hasta</label>
                <input type="date" name="f_fin" value="<?= $fecha_fin ?>" class="input input-sm input-bordered rounded-lg">
            </div>
            <div class="form-control w-full md:w-auto">
                <label class="label-text text-[10px] font-bold uppercase text-gray-400 ml-1">Proveedor</label>
                <select name="proveedor" class="select select-sm select-bordered rounded-lg w-full md:w-40">
                    <option value="">Todos</option>
                    <?php foreach ($proveedores as $prov): ?>
                        <option value="<?= $prov ?>" <?= $filtro_prov == $prov ? 'selected' : '' ?>><?= $prov ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="form-control w-full md:w-auto">
                <label class="label-text text-[10px] font-bold uppercase text-gray-400 ml-1">Estatus</label>
                <select name="estado" class="select select-sm select-bordered rounded-lg w-full md:w-32">
                    <option value="">Todos</option>
                    <option value="PENDIENTE" <?= $filtro_estado=='PENDIENTE'?'selected':'' ?>>🟡 Pendiente</option>
                    <option value="ENVIADO" <?= $filtro_estado=='ENVIADO'?'selected':'' ?>>🟠 Enviado</option>
                    <option value="FINALIZADO" <?= $filtro_estado=='FINALIZADO'?'selected':'' ?>>🟢 Finalizado</option>
                </select>
            </div>
            <div class="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                <button type="submit" class="btn btn-sm btn-primary rounded-lg flex-grow"><i class="bi bi-filter"></i> Filtrar</button>
                <a href="index.php?modulo=historial_facturas" class="btn btn-sm btn-ghost btn-square rounded-lg tooltip" data-tip="Limpiar">
                    <i class="bi bi-arrow-counterclockwise"></i>
                </a>
            </div>
        </form>
    </div>

    <div class="card bg-white shadow-xl border border-base-200 rounded-2xl overflow-hidden">
        
        <div class="p-4 border-b border-base-200 flex flex-col md:flex-row justify-between items-center bg-base-50 gap-4">
            <div class="flex items-center gap-2 w-full md:w-auto">
                <span class="text-xs font-bold text-gray-500">Mostrar</span>
                <select id="rowsPerPage" onchange="HistorialAPI.cambiarPagina(1)" class="select select-bordered select-xs w-20">
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                </select>
                <span class="text-xs font-bold text-gray-500">registros</span>
            </div>

            <div class="relative w-full max-w-xs">
                <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input type="text" id="filtroJS" onkeyup="HistorialAPI.filtrarYPaginar()" placeholder="Buscar..." class="input input-sm pl-9 w-full bg-white border-base-300 rounded-full">
            </div>
        </div>

        <div class="overflow-x-auto min-h-[300px]">
            <table class="table w-full whitespace-nowrap" id="tablaRemisiones">
                <thead class="bg-base-100 text-gray-500 uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                        <th class="pl-6 py-4">Folio / ID</th>
                        <th>Proveedor</th>
                        <th>Fecha Registro</th>
                        <th class="text-center">Total Items</th>
                        <th class="text-center">Estado</th>
                        <th class="text-right pr-6">Gestionar</th>
                    </tr>
                </thead>
                <tbody class="text-gray-600 text-sm" id="cuerpoTabla">
                    <?php foreach ($remisiones as $r): 
                        $esFinal = ($r['estado'] === 'FINALIZADO');
                        $colorBadge = ($r['estado'] == 'FINALIZADO') ? 'badge-success text-white' : ($r['estado'] == 'PENDIENTE' ? 'badge-warning text-white' : 'badge-info text-white');
                        $iconProv = ($r['proveedor'] == 'Paola') ? 'bi-person-badge-fill text-pink-500' : 'bi-shop text-blue-500';
                        $busqueda = strtolower($r['numero_remision'] . ' ' . $r['id'] . ' ' . $r['proveedor'] . ' ' . $r['estado']);
                    ?>
                    <tr class="hover:bg-blue-50 transition-colors border-b border-base-100 group fila-datos" data-search="<?= $busqueda ?>">
                        <td class="pl-6 py-3 font-medium">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center text-primary font-bold text-xs shadow-sm">
                                    <?= $r['id'] ?>
                                </div>
                                <div>
                                    <div class="font-black text-base text-gray-800"># <?= htmlspecialchars($r['numero_remision']) ?></div>
                                    <div class="text-[10px] text-gray-400 uppercase font-bold tracking-wide">ID Interno</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <i class="bi <?= $iconProv ?>"></i>
                                <span class="font-bold"><?= htmlspecialchars($r['proveedor'] ?: 'Manual') ?></span>
                            </div>
                        </td>
                        <td>
                            <div class="flex flex-col">
                                <span class="font-bold text-gray-700"><?= date('d M Y', strtotime($r['fecha_carga'])) ?></span>
                                <span class="text-xs text-gray-400"><?= date('h:i A', strtotime($r['fecha_carga'])) ?></span>
                            </div>
                        </td>
                        <td class="text-center">
                            <div class="badge badge-ghost font-bold"><?= $r['total_items'] ?></div>
                        </td>
                        <td class="text-center">
                            <span class="badge <?= $colorBadge ?> font-bold py-3 px-4 rounded-full text-xs shadow-sm"><?= $r['estado'] ?></span>
                        </td>
                        <td class="text-right pr-6">
                            <div class="flex justify-end gap-2 opacity-100 transition-opacity">
                                <button onclick="HistorialAPI.abrirModalDetalles(<?= $r['id'] ?>, '<?= $r['numero_remision'] ?>', '<?= $r['estado'] ?>', '<?= date('d/m/Y', strtotime($r['fecha_carga'])) ?>')" 
                                        class="btn btn-sm btn-ghost bg-base-100 border border-base-200 hover:border-primary hover:text-primary hover:bg-white shadow-sm gap-2 rounded-lg">
                                    <i class="bi bi-eye-fill"></i> Ver
                                </button>
                                <?php if ($esFinal): ?>
                                    <button onclick="HistorialAPI.descargarExcel('<?= $r['numero_remision'] ?>')" class="btn btn-sm btn-square btn-success text-white rounded-lg shadow-sm tooltip tooltip-left" data-tip="Excel"><i class="bi bi-file-earmark-excel-fill"></i></button>
                                <?php endif; ?>
                                <?php if ($_SESSION['rol'] === 'admin'): ?>
                                    <button onclick="HistorialAPI.eliminarRemision(<?= $r['id'] ?>, '<?= $r['numero_remision'] ?>')" class="btn btn-sm btn-square btn-ghost text-error hover:bg-red-50 rounded-lg"><i class="bi bi-trash"></i></button>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <div class="p-4 border-t border-base-200 bg-base-50 flex justify-between items-center" id="paginacionContainer">
            <span class="text-xs text-gray-500" id="infoPaginacion">Mostrando 0 de 0</span>
            <div class="join shadow-sm bg-white">
                <button class="join-item btn btn-sm btn-ghost" onclick="HistorialAPI.prevPage()">«</button>
                <button class="join-item btn btn-sm btn-ghost pointer-events-none" id="lblPagina">Pag 1</button>
                <button class="join-item btn btn-sm btn-ghost" onclick="HistorialAPI.nextPage()">»</button>
            </div>
        </div>
    </div>
</div>

<dialog id="modalDetalles" class="modal modal-bottom sm:modal-middle">
  <div class="modal-box w-full max-w-7xl h-[95vh] flex flex-col p-0 bg-gray-50 rounded-2xl">
    <div class="bg-white p-4 border-b border-base-200 flex flex-wrap justify-between items-center sticky top-0 z-50 shadow-sm">
        <div class="flex items-center gap-4">
            <div class="bg-primary/10 p-2 rounded-xl text-primary"><i class="bi bi-receipt-cutoff text-2xl"></i></div>
            <div>
                <div class="flex items-center gap-3">
                    <h3 class="font-black text-2xl text-gray-800 leading-none" id="modalTitulo"># ---</h3>
                    <span class="badge badge-sm badge-ghost" id="modalEstado">---</span>
                </div>
                <p class="text-xs text-gray-400 font-medium mt-1" id="modalSubtitulo">---</p>
            </div>
        </div>
        <div id="toolbarModal" class="hidden md:flex items-center bg-base-50 rounded-xl border border-base-200 p-1 pr-3 shadow-inner">
            <div class="px-3 border-r border-base-300 mr-2 text-xs font-bold text-gray-400 uppercase">Configuración Visual</div>
            <select id="sel_proveedor_modal" class="select select-ghost select-sm w-40 font-bold text-gray-700 focus:bg-transparent h-8 min-h-0 focus:outline-none" onchange="HistorialAPI.aplicarPerfilModal(this.value)">
                <option value="custom" selected>🖐 Manual</option>
                <option value="paola_fac">📄 Paola (Fac)</option>
                <option value="paola_rem">📝 Paola (Rem)</option>
                <option value="tony">🐯 Tony</option>
                <option value="optivosa">👓 Optivosa</option>
            </select>
        </div>
        <form method="dialog"><button class="btn btn-sm btn-circle btn-ghost text-gray-400 hover:text-gray-800 text-lg">✕</button></form>
    </div>
    <div class="flex-grow overflow-y-auto p-4 md:p-6" id="modalContenido">
        <div class="flex justify-center items-center h-full"><span class="loading loading-dots loading-lg text-primary"></span></div>
    </div>
    <div class="p-4 border-t border-base-200 bg-white flex justify-between items-center">
        <div class="text-xs text-gray-400 hidden md:block"><i class="bi bi-info-circle"></i> Los cambios aquí solo afectan si el estado es PENDIENTE.</div>
        <div class="flex gap-2">
            <form method="dialog"><button class="btn btn-ghost btn-sm md:btn-md rounded-xl">Cerrar</button></form>
            <button id="btnGuardarModal" class="btn btn-primary btn-sm md:btn-md hidden rounded-xl shadow-lg" onclick="HistorialAPI.guardarCambiosModal()"><i class="bi bi-save"></i> Guardar Cambios</button>
        </div>
    </div>
  </div>
</dialog>

<script>
(() => {
    let currentRemisionId = 0;
    let currentRemisionFolio = '';
    const fmtMoney = (n) => parseFloat(n).toLocaleString('es-MX', {style:'currency', currency:'MXN'});

    // --- VARIABLES PAGINACIÓN ---
    let currentPage = 1;
    let rowsPerPage = 10;
    let visibleRows = []; // Almacena las filas que coinciden con la búsqueda

    window.HistorialAPI = {
        
        init: () => {
            // Inicializar paginación
            HistorialAPI.filtrarYPaginar();
        },

        // --- SISTEMA DE PAGINACIÓN JS ---
        filtrarYPaginar: () => {
            const input = document.getElementById("filtroJS").value.toLowerCase();
            const table = document.getElementById("tablaRemisiones");
            const allRows = table.getElementsByTagName("tbody")[0].getElementsByTagName("tr");
            
            visibleRows = [];

            // 1. Filtrar
            for (let i = 0; i < allRows.length; i++) {
                if (allRows[i].getAttribute('data-search').indexOf(input) > -1) {
                    visibleRows.push(allRows[i]);
                } else {
                    allRows[i].style.display = "none"; // Ocultar los que no coinciden
                }
            }

            // 2. Paginar
            HistorialAPI.renderizarPagina();
        },

        renderizarPagina: () => {
            const totalRows = visibleRows.length;
            const totalPages = Math.ceil(totalRows / rowsPerPage);
            
            // Validar límites
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

            // Ocultar todos los visibles primero para resetear la vista actual
            visibleRows.forEach(row => row.style.display = "none");

            // Calcular slice
            const start = (currentPage - 1) * rowsPerPage;
            const end = start + rowsPerPage;
            
            // Mostrar solo los de la página actual
            for (let i = start; i < end && i < totalRows; i++) {
                visibleRows[i].style.display = "";
            }

            // Actualizar UI Paginación
            document.getElementById("infoPaginacion").innerText = `Mostrando ${start + 1} - ${Math.min(end, totalRows)} de ${totalRows}`;
            document.getElementById("lblPagina").innerText = `Pag ${currentPage} de ${totalPages || 1}`;
        },

        cambiarPagina: (newPage) => {
            // Si viene del select, newPage es 1 y actualizamos rowsPerPage
            const select = document.getElementById("rowsPerPage");
            if (newPage === 1 && select) rowsPerPage = parseInt(select.value);
            
            currentPage = newPage;
            HistorialAPI.filtrarYPaginar(); // Re-renderizar
        },

        nextPage: () => {
            const totalPages = Math.ceil(visibleRows.length / rowsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                HistorialAPI.renderizarPagina();
            }
        },

        prevPage: () => {
            if (currentPage > 1) {
                currentPage--;
                HistorialAPI.renderizarPagina();
            }
        },

        // --- FUNCIONES DEL MODAL (IGUAL QUE ANTES) ---
        abrirModalDetalles: (id, folio, estado, fecha) => {
            currentRemisionId = id; currentRemisionFolio = folio;
            document.getElementById('modalTitulo').innerText = '# ' + folio;
            document.getElementById('modalEstado').innerText = estado;
            document.getElementById('modalSubtitulo').innerText = 'Registrado el: ' + fecha;
            document.getElementById('modalDetalles').showModal();
            document.getElementById('modalContenido').innerHTML = '<div class="flex flex-col justify-center items-center h-64 opacity-50"><span class="loading loading-bars loading-lg text-primary"></span></div>';
            
            const btnGuardar = document.getElementById('btnGuardarModal');
            if (estado === 'PENDIENTE') btnGuardar.classList.remove('hidden'); else btnGuardar.classList.add('hidden');

            fetch('api/api_leer_factura.php?id=' + id + '&t=' + Date.now()).then(r => r.json()).then(data => {
                if(data.success) HistorialAPI.renderizarTablaModal(data.datos, estado);
                else document.getElementById('modalContenido').innerHTML = `<div class="alert alert-error text-sm">${data.error}</div>`;
            });
        },

        renderizarTablaModal: (grupos, estadoFactura) => {
            const esEditable = (estadoFactura === 'PENDIENTE');
            let html = `<div class="space-y-4">`; 
            let globalIdx = 0;
            for (const [remision, productos] of Object.entries(grupos)) {
                productos.forEach((p) => {
                    let idx = globalIdx++;
                    let esPaquete = (p.es_paquete == 1);
                    let piezas = parseFloat(p.piezas_por_paquete || 1);
                    let cantidadFisica = parseFloat(p.existencia_lapiz || 0);
                    let ivaDB = (p.aplica_iva == 1);
                    let descDB = (p.aplica_descuento == 1);
                    let claveSicar = p.clave_final || '---';

                    let inputHtml = esEditable 
                        ? `<input type="number" step="any" class="input input-sm input-bordered w-full md:w-24 text-center font-bold text-primary text-lg data-modal-input" 
                            data-cod="${p.cod_prov}" data-es-paq="${esPaquete?1:0}" data-piezas="${piezas}" 
                            id="m_fisico_${idx}" value="${cantidadFisica}">` 
                        : `<div class="font-black text-2xl text-gray-700">${cantidadFisica}</div>`;

                    let paqueteInfo = esPaquete ? `<span class="badge badge-secondary badge-outline text-xs font-bold">📦 Caja (${piezas} pz)</span>` : `<span class="badge badge-ghost text-xs text-gray-400">Pieza</span>`;

                    html += `
                    <div class="card bg-white border border-base-200 shadow-sm p-4 fila-modal rounded-xl hover:shadow-md transition-all">
                        <div class="flex flex-col md:flex-row gap-6 items-center">
                            <div class="flex-grow w-full md:w-auto text-center md:text-left">
                                <h4 class="font-bold text-lg text-gray-800 leading-snug mb-2">${p.desc}</h4>
                                <div class="flex flex-wrap justify-center md:justify-start gap-2 items-center">
                                    <div class="tooltip" data-tip="Código Proveedor"><span class="badge badge-lg badge-neutral font-mono">${p.cod_prov}</span></div>
                                    <div class="tooltip" data-tip="Clave SICAR"><span class="badge badge-lg badge-outline font-mono text-gray-600 bg-base-100 border-base-300">SICAR: ${claveSicar}</span></div>
                                    ${paqueteInfo}
                                </div>
                            </div>
                            <div class="flex flex-col items-center bg-base-50 p-3 rounded-xl border border-base-200 min-w-[120px]">
                                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CONTEO</span>
                                ${inputHtml}
                            </div>
                            <div class="w-full md:w-auto flex flex-col gap-2 min-w-[220px]">
                                <div class="flex justify-between bg-base-50 rounded-lg p-2 border border-base-200">
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="m_chk_iva_${idx}" class="checkbox checkbox-xs checkbox-primary chk-iva-modal" ${ivaDB?'checked':''} onchange="HistorialAPI.calcularFilaModal(${idx})" ${!esEditable?'disabled':''}><span class="text-xs font-bold text-gray-600">+IVA (16%)</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="m_chk_desc_${idx}" class="checkbox checkbox-xs checkbox-secondary chk-desc-modal" ${descDB?'checked':''} onchange="HistorialAPI.calcularFilaModal(${idx})" ${!esEditable?'disabled':''}><span class="text-xs font-bold text-gray-600">-5% Desc</span></label>
                                </div>
                                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-l-4 border-primary pl-3">
                                    <div class="text-gray-400 font-bold">Costo Neto:</div><div class="font-black text-gray-800 text-right" id="m_lbl_costo_neto_${idx}">$0</div>
                                    <div class="text-blue-500 font-bold">Precio 20%:</div><div class="font-bold text-blue-700 text-right" id="m_lbl_p20_${idx}">$0</div>
                                    <div class="text-green-500 font-bold">Precio 30%:</div><div class="font-bold text-green-700 text-right" id="m_lbl_p30_${idx}">$0</div>
                                </div>
                            </div>
                            <input type="hidden" id="m_costo_base_${idx}" value="${p.costo}">
                            <input type="hidden" id="m_es_paquete_${idx}" value="${esPaquete?1:0}">
                            <input type="hidden" id="m_piezas_${idx}" value="${piezas}">
                        </div>
                    </div>`;
                    setTimeout(() => HistorialAPI.calcularFilaModal(idx), 50);
                });
            }
            html += `</div>`;
            document.getElementById('modalContenido').innerHTML = html;
        },

        calcularFilaModal: (idx) => {
            const costoBase = parseFloat(document.getElementById(`m_costo_base_${idx}`).value) || 0;
            const chkIva = document.getElementById(`m_chk_iva_${idx}`).checked;
            const chkDesc = document.getElementById(`m_chk_desc_${idx}`).checked;
            const esPaquete = (document.getElementById(`m_es_paquete_${idx}`).value == "1");
            const piezas = parseFloat(document.getElementById(`m_piezas_${idx}`).value) || 1;

            let costoConImpuestos = costoBase;
            if(chkIva) costoConImpuestos *= 1.16;
            if(chkDesc) costoConImpuestos *= 0.95;

            // En el modal mostramos costos unitarios base, o por caja si así se prefiere.
            // Para consistencia con recepción, asumimos unitario.
            let costoFinal = costoConImpuestos; 

            document.getElementById(`m_lbl_costo_neto_${idx}`).innerText = fmtMoney(costoFinal);
            document.getElementById(`m_lbl_p20_${idx}`).innerText = fmtMoney(costoFinal * 1.20);
            document.getElementById(`m_lbl_p30_${idx}`).innerText = fmtMoney(costoFinal * 1.30);
        },

        guardarCambiosModal: () => {
            const btn = document.getElementById('btnGuardarModal');
            const inputs = document.querySelectorAll('.data-modal-input');
            const fd = new FormData();
            let cambios = 0;
            
            fd.append('remision_id', currentRemisionFolio);
            inputs.forEach((inp, i) => {
                fd.append(`items[${i}][cod_prov]`, inp.getAttribute('data-cod'));
                fd.append(`items[${i}][exis_lapiz]`, inp.value);
                fd.append(`items[${i}][es_paquete]`, inp.getAttribute('data-es-paq'));
                fd.append(`items[${i}][piezas_por_paquete]`, inp.getAttribute('data-piezas'));
                
                let iva = document.getElementById(`m_chk_iva_${i}`).checked ? 1 : 0;
                let desc = document.getElementById(`m_chk_desc_${i}`).checked ? 1 : 0;
                fd.append(`items[${i}][aplica_iva]`, iva);
                fd.append(`items[${i}][aplica_descuento]`, desc);
                cambios++;
            });

            if(cambios === 0) return Swal.fire('Nada que guardar', '', 'info');

            btn.disabled = true; btn.innerHTML = 'Guardando...';
            fetch('api/enviar_revision.php', { method: 'POST', body: fd }).then(r => r.json()).then(data => {
                if(data.success) {
                    Swal.fire({icon: 'success', title: 'Guardado', timer: 1500, showConfirmButton: false});
                    location.reload(); 
                } else Swal.fire('Error', data.error, 'error');
            }).finally(() => { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save"></i> Guardar Cambios'; });
        },

        descargarExcel: (folio) => {
            let ifr = document.createElement('iframe'); ifr.style.display='none'; document.body.appendChild(ifr);
            let form = document.createElement("form"); form.target = ifr.name = 'dl_' + Date.now(); 
            form.method = "POST"; form.action = "api/generar_sicar_final.php";
            let inp = document.createElement("input"); inp.type="hidden"; inp.name="remision_id"; inp.value=folio;
            form.appendChild(inp); document.body.appendChild(form); form.submit();
            setTimeout(() => { document.body.removeChild(ifr); document.body.removeChild(form); }, 3000);
            Swal.fire({icon: 'success', title: 'Descarga iniciada', toast:true, position:'top-end', showConfirmButton:false, timer:2000});
        },

        eliminarRemision: (id, folio) => {
            Swal.fire({
                title: '¿Eliminar ' + folio + '?', text: "Esta acción no se puede deshacer.", icon: 'warning',
                showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar permanentemente'
            }).then((result) => {
                if (result.isConfirmed) {
                    let fd = new FormData(); fd.append('id', id);
                    fetch('api/eliminar_remision.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => {
                        if(d.success) {
                            Swal.fire('Eliminado', 'Registro borrado.', 'success').then(() => location.reload());
                        } else Swal.fire('Error', d.error, 'error');
                    });
                }
            });
        },
        
        aplicarPerfilModal: (perfil) => {
            // Lógica duplicada para asegurar funcionamiento en modal (ya definida arriba)
            let activarIva = false, activarDesc = false;
            switch(perfil) {
                case 'paola_fac': activarIva=true; activarDesc=true; break;
                case 'paola_rem': activarIva=false; activarDesc=true; break;
                case 'tony': activarIva=false; activarDesc=true; break;
                case 'optivosa': activarIva=true; activarDesc=false; break;
                case 'custom': return; 
            }
            document.querySelectorAll('.chk-iva-modal').forEach(chk => { chk.checked = activarIva; });
            document.querySelectorAll('.chk-desc-modal').forEach(chk => { chk.checked = activarDesc; });
            document.querySelectorAll('.fila-modal').forEach((row, idx) => HistorialAPI.calcularFilaModal(idx));
        }
    };

    // INICIAR
    HistorialAPI.init();
})();
</script>