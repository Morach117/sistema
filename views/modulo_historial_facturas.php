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
$rol = $_SESSION['rol'] ?? 'empleado';
?>
<script>window.userRol = '<?= $rol ?>';</script>

<style>
    /* Estilos Modernos 2026 */
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
    
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    
    /* Scrollbar minimalista */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    
    .glass-panel { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6); }
    .shadow-soft { box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); }
</style>

<div class="h-full overflow-y-auto p-4 md:p-8 bg-slate-50 font-sans text-sm selection:bg-indigo-100 custom-scrollbar pb-10">
    
    <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-6">
        <div>
            <h1 class="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                    <i class="bi bi-folder2-open text-white text-2xl"></i>
                </div>
                Historial de Recepciones
            </h1>
            <p class="text-sm text-slate-500 font-bold ml-1 mt-1 uppercase tracking-widest">Consulta y Auditoría</p>
        </div>
        
        <div class="glass-panel p-4 rounded-3xl shadow-sm flex flex-wrap gap-4 w-full xl:w-auto items-end">
            
            <div class="flex-1 min-w-[120px]">
                <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Desde</label>
                <input type="date" id="filtro_f_inicio" value="<?= $fecha_inicio ?>" onkeydown="if(event.key === 'Enter') HistorialAPI.aplicarFiltrosGlobales()" class="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 font-bold text-slate-600 transition-all">
            </div>
            <div class="flex-1 min-w-[120px]">
                <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Hasta</label>
                <input type="date" id="filtro_f_fin" value="<?= $fecha_fin ?>" onkeydown="if(event.key === 'Enter') HistorialAPI.aplicarFiltrosGlobales()" class="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 font-bold text-slate-600 transition-all">
            </div>
            <div class="flex-1 min-w-[140px]">
                <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Proveedor</label>
                <select id="filtro_proveedor" onchange="HistorialAPI.aplicarFiltrosGlobales()" class="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 font-bold text-slate-600 cursor-pointer">
                    <option value="">Todos</option>
                    <?php foreach ($proveedores as $prov): ?>
                        <option value="<?= $prov ?>" <?= $filtro_prov == $prov ? 'selected' : '' ?>><?= $prov ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="flex-1 min-w-[140px]">
                <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Estatus</label>
                <select id="filtro_estado" onchange="HistorialAPI.aplicarFiltrosGlobales()" class="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 font-bold text-slate-600 cursor-pointer">
                    <option value="">Todos</option>
                    <option value="PENDIENTE" <?= $filtro_estado=='PENDIENTE'?'selected':'' ?>>🟡 Pendiente</option>
                    <option value="ENVIADO" <?= $filtro_estado=='ENVIADO'?'selected':'' ?>>🟠 Enviado</option>
                    <option value="FINALIZADO" <?= $filtro_estado=='FINALIZADO'?'selected':'' ?>>🟢 Finalizado</option>
                </select>
            </div>
            <div class="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                <button type="button" onclick="HistorialAPI.aplicarFiltrosGlobales()" class="bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-6 rounded-xl font-bold shadow-md shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2 flex-grow justify-center"><i class="bi bi-filter"></i> Filtrar</button>
                <button type="button" onclick="HistorialAPI.limpiarFiltrosGlobales()" class="bg-slate-100 hover:bg-slate-200 text-slate-500 h-10 w-10 flex items-center justify-center rounded-xl transition-all tooltip" data-tip="Limpiar">
                    <i class="bi bi-arrow-counterclockwise"></i>
                </button>
            </div>
        </div>
    </div>

    <div class="glass-panel shadow-soft rounded-3xl overflow-hidden flex flex-col">
        
        <div class="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center bg-white/50 gap-4">
            <div class="flex items-center gap-3 w-full md:w-auto bg-slate-100 px-3 py-1.5 rounded-xl">
                <span class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Mostrar</span>
                <select id="rowsPerPage" onchange="HistorialAPI.cambiarPagina(1)" class="bg-transparent font-bold text-slate-700 text-xs focus:outline-none cursor-pointer">
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                </select>
            </div>

            <div class="relative w-full max-w-xs">
                <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input type="text" id="filtroJS" onkeyup="HistorialAPI.filtrarYPaginar()" placeholder="Buscar factura, ID..." class="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 outline-none font-bold text-slate-600 transition-all">
            </div>
        </div>

        <div class="overflow-x-auto min-h-[300px] p-2">
            <table class="w-full text-left border-collapse" id="tablaRemisiones">
                <thead class="bg-slate-100/80 backdrop-blur-sm text-slate-500 text-[10px] uppercase font-extrabold tracking-wider sticky top-0 z-10 rounded-xl">
                    <tr>
                        <th class="p-4 border-b border-slate-200 rounded-tl-xl">Folio / ID</th>
                        <th class="p-4 border-b border-slate-200">Proveedor</th>
                        <th class="p-4 border-b border-slate-200">Fecha Registro</th>
                        <th class="p-4 border-b border-slate-200 text-center">Items</th>
                        <th class="p-4 border-b border-slate-200 text-center">Estado</th>
                        <th class="p-4 border-b border-slate-200 text-right rounded-tr-xl">Gestionar</th>
                    </tr>
                </thead>
                <tbody class="text-sm text-slate-700 font-medium divide-y divide-slate-100" id="cuerpoTabla">
                    <?php foreach ($remisiones as $r): 
                        $esFinal = ($r['estado'] === 'FINALIZADO');
                        $colorBadge = ($r['estado'] == 'FINALIZADO') ? 'bg-emerald-100 text-emerald-700' : ($r['estado'] == 'PENDIENTE' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700');
                        $pStr = strtoupper($r['proveedor'] ?? '');
                        $iconProv = ($pStr === 'TONY') ? '🐯' : (($pStr === 'PAOLA' || $pStr === 'OPERADORA') ? '📄' : (($pStr === 'OPTIVOSA') ? '👓' : '📦'));
                        $busqueda = strtolower($r['numero_remision'] . ' ' . $r['id'] . ' ' . $r['proveedor'] . ' ' . $r['estado']);
                    ?>
                    <tr class="hover:bg-slate-50/80 transition-colors group fila-datos" data-search="<?= $busqueda ?>">
                        <td class="p-4 font-medium">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs shadow-sm">
                                    <?= $r['id'] ?>
                                </div>
                                <div>
                                    <div class="font-black text-base text-slate-800 tracking-tight"># <?= htmlspecialchars($r['numero_remision']) ?></div>
                                    <div class="text-[9px] text-slate-400 uppercase font-extrabold tracking-widest">ID Interno</div>
                                </div>
                            </div>
                        </td>
                        <td class="p-4">
                            <div class="flex items-center gap-2">
                                <span><?= $iconProv ?></span>
                                <span class="font-bold text-slate-700"><?= htmlspecialchars($r['proveedor'] ?: 'Manual') ?></span>
                            </div>
                        </td>
                        <td class="p-4">
                            <div class="flex flex-col">
                                <span class="font-bold text-slate-700"><?= date('d M Y', strtotime($r['fecha_carga'])) ?></span>
                                <span class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mt-0.5"><?= date('h:i A', strtotime($r['fecha_carga'])) ?></span>
                            </div>
                        </td>
                        <td class="p-4 text-center">
                            <span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs font-black border border-slate-200"><?= $r['total_items'] ?></span>
                        </td>
                        <td class="p-4 text-center">
                            <span class="px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest <?= $colorBadge ?>"><?= $r['estado'] ?></span>
                        </td>
                        <td class="p-4 text-right">
                            <div class="flex justify-end gap-2">
                                <button onclick="HistorialAPI.abrirModalDetalles(<?= $r['id'] ?>, '<?= $r['numero_remision'] ?>', '<?= $r['estado'] ?>', '<?= date('d/m/Y', strtotime($r['fecha_carga'])) ?>', '<?= htmlspecialchars($r['proveedor']) ?>')" 
                                        class="bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-500 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95 flex items-center gap-2">
                                    <i class="bi bi-eye-fill"></i> Ver
                                </button>
                                <?php if ($esFinal): ?>
                                    <button onclick="HistorialAPI.descargarExcel('<?= $r['numero_remision'] ?>')" class="bg-emerald-500 hover:bg-emerald-600 text-white w-9 h-9 rounded-xl shadow-md shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center" title="Descargar Excel"><i class="bi bi-file-earmark-excel-fill text-lg"></i></button>
                                <?php endif; ?>
                                <?php if ($rol === 'admin'): ?>
                                    <button onclick="HistorialAPI.eliminarRemision(<?= $r['id'] ?>, '<?= $r['numero_remision'] ?>')" class="bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 w-9 h-9 rounded-xl transition-all flex items-center justify-center tooltip tooltip-left" data-tip="Eliminar Permanente"><i class="bi bi-trash text-lg"></i></button>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <div class="p-4 border-t border-slate-200 bg-white/50 flex justify-between items-center" id="paginacionContainer">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest" id="infoPaginacion">Mostrando 0 de 0</span>
            <div class="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <button class="w-8 h-8 rounded-lg font-black text-slate-500 hover:bg-slate-100 transition-colors" onclick="HistorialAPI.prevPage()">«</button>
                <button class="px-3 h-8 rounded-lg font-black text-indigo-600 bg-indigo-50" id="lblPagina">1</button>
                <button class="w-8 h-8 rounded-lg font-black text-slate-500 hover:bg-slate-100 transition-colors" onclick="HistorialAPI.nextPage()">»</button>
            </div>
        </div>
    </div>
</div>

<dialog id="modalDetalles" class="modal modal-bottom sm:modal-middle" style="background: rgba(15,23,42,0.6); backdrop-filter: blur(4px);">
  <div class="modal-box w-11/12 max-w-screen-2xl max-h-[90vh] flex flex-col p-0 bg-slate-50 rounded-[2rem] overflow-hidden shadow-2xl border border-slate-300">
    
    <div class="glass-panel min-h-[4rem] px-5 flex flex-wrap justify-between items-center sticky top-0 z-50 border-b border-slate-200 shadow-sm">
        <div class="flex items-center gap-4 py-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <i class="bi bi-clipboard-check-fill text-white text-lg"></i>
            </div>
            <div>
                <div class="flex items-center gap-3">
                    <h3 class="font-black text-xl text-slate-800 leading-none tracking-tight" id="modalTitulo"># ---</h3>
                    <span class="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider bg-slate-200 text-slate-600" id="modalEstado">---</span>
                </div>
                <p class="text-[10px] text-slate-400 font-extrabold tracking-widest uppercase mt-1" id="modalSubtitulo">---</p>
            </div>
        </div>
        
        <div class="flex items-center gap-3 py-2">
            <?php if ($rol === 'admin'): ?>
                <div class="flex items-center bg-white rounded-xl border border-slate-200 px-3 py-1.5 shadow-sm hidden md:flex">
                    <span class="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mr-2">PERFIL VISUAL</span>
                    <select id="sel_proveedor_modal" class="bg-transparent font-bold text-slate-700 text-xs focus:outline-none cursor-pointer" onchange="HistorialAPI.recalcularTodoModal()">
                        <option value="custom">🖐 Manual</option>
                        <option value="paola">📄 Paola/Oper.</option>
                        <option value="tony">🐯 Tony</option>
                        <option value="optivosa">👓 Optivosa</option>
                        <option value="sindesc">🚫 Sin Descuentos</option>
                    </select>
                </div>
                
                <div class="flex items-center bg-purple-50 rounded-xl border border-purple-200 px-3 py-1.5 shadow-sm">
                    <span class="text-[9px] font-extrabold uppercase tracking-widest text-purple-500 mr-1">DTO %</span>
                    <input type="number" id="inp_desc_global_modal" value="5" class="w-8 bg-transparent font-black text-purple-700 text-sm focus:outline-none text-center" onchange="HistorialAPI.recalcularTodoModal()">
                </div>
            <?php endif; ?>
            <button class="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 hover:border-indigo-300 text-slate-500 hover:text-indigo-600 rounded-xl transition-colors active:scale-95" onclick="HistorialAPI.toggleZoomModal()" title="Modo Lectura A+"><i class="bi bi-type-h1 text-lg"></i></button>
            <form method="dialog"><button class="w-9 h-9 flex items-center justify-center bg-slate-200 hover:bg-red-500 text-slate-500 hover:text-white rounded-xl transition-colors"><i class="bi bi-x-lg text-lg"></i></button></form>
        </div>
    </div>

    <div class="flex-grow overflow-y-auto p-4 md:p-6 custom-scrollbar" id="modalContenido">
        <div class="flex flex-col justify-center items-center h-full text-slate-300 mt-20">
            <span class="loading loading-bars loading-lg text-indigo-400 mb-4"></span>
            <span class="font-bold tracking-widest text-xs uppercase">Cargando Factura...</span>
        </div>
    </div>

    <div class="p-5 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
        <div class="text-xs text-slate-400 font-medium hidden md:flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
            <i class="bi bi-info-circle text-indigo-400"></i> Los cambios solo se guardan si la factura está "PENDIENTE".
        </div>
        <div class="flex gap-3 w-full md:w-auto">
            <form method="dialog" class="w-1/2 md:w-auto"><button class="w-full h-12 px-6 flex items-center justify-center font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cerrar</button></form>
            <button id="btnGuardarModal" class="w-1/2 md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 hidden flex items-center justify-center gap-2" onclick="HistorialAPI.guardarCambiosModal()">
                <i class="bi bi-save"></i> Guardar Cambios
            </button>
        </div>
    </div>
  </div>
</dialog>

<script>
(() => {
    let currentRemisionId = 0;
    let currentRemisionFolio = '';
    let zoomModeModal = false;
    let dataCacheModal = null; 
    
    const fmtMoney = (n) => parseFloat(n).toLocaleString('es-MX', {style:'currency', currency:'MXN'});
    const fmtInt = (n) => parseFloat(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });

    let currentPage = 1;
    let rowsPerPage = 10;
    let visibleRows = []; 

    window.HistorialAPI = {
        
        init: () => { HistorialAPI.filtrarYPaginar(); },

        // --- FIX 2: SISTEMA DE FILTROS ADAPTADO PARA JS (SPA) ---
        aplicarFiltrosGlobales: () => {
            const f_ini = document.getElementById('filtro_f_inicio').value;
            const f_fin = document.getElementById('filtro_f_fin').value;
            const prov = document.getElementById('filtro_proveedor').value;
            const est = document.getElementById('filtro_estado').value;
            
            // Construimos la URL limpia para pedirle a PHP los datos filtrados y la inyectamos sin recargar la página entera
            const url = `views/modulo_historial_facturas.php?f_inicio=${f_ini}&f_fin=${f_fin}&proveedor=${prov}&estado=${est}`;
            
            const container = document.getElementById('app-container');
            const loader = document.getElementById('loading-overlay');
            if(loader) loader.style.display = 'flex';
            
            fetch(url)
                .then(r => r.text())
                .then(html => {
                    container.innerHTML = html;
                    const scripts = container.querySelectorAll("script");
                    scripts.forEach(oldScript => {
                        const newScript = document.createElement("script");
                        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                        oldScript.parentNode.replaceChild(newScript, oldScript);
                    });
                })
                .finally(() => { if(loader) setTimeout(() => loader.style.display = 'none', 150); });
        },

        limpiarFiltrosGlobales: () => {
            document.getElementById('filtro_f_inicio').value = '<?= date('Y-m-01') ?>';
            document.getElementById('filtro_f_fin').value = '<?= date('Y-m-d') ?>';
            document.getElementById('filtro_proveedor').value = '';
            document.getElementById('filtro_estado').value = '';
            HistorialAPI.aplicarFiltrosGlobales();
        },

        filtrarYPaginar: () => {
            const input = document.getElementById("filtroJS").value.toLowerCase();
            const table = document.getElementById("tablaRemisiones");
            const allRows = table.getElementsByTagName("tbody")[0].getElementsByTagName("tr");
            visibleRows = [];
            for (let i = 0; i < allRows.length; i++) {
                if (allRows[i].getAttribute('data-search').indexOf(input) > -1) { visibleRows.push(allRows[i]); } 
                else { allRows[i].style.display = "none"; }
            }
            HistorialAPI.renderizarPagina();
        },

        renderizarPagina: () => {
            const totalRows = visibleRows.length;
            const totalPages = Math.ceil(totalRows / rowsPerPage);
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
            visibleRows.forEach(row => row.style.display = "none");

            const start = (currentPage - 1) * rowsPerPage;
            const end = start + rowsPerPage;
            for (let i = start; i < end && i < totalRows; i++) { visibleRows[i].style.display = ""; }

            document.getElementById("infoPaginacion").innerText = `Mostrando ${start + 1} - ${Math.min(end, totalRows)} de ${totalRows}`;
            document.getElementById("lblPagina").innerText = `${currentPage} / ${totalPages || 1}`;
        },

        cambiarPagina: (newPage) => {
            const select = document.getElementById("rowsPerPage");
            if (newPage === 1 && select) rowsPerPage = parseInt(select.value);
            currentPage = newPage;
            HistorialAPI.filtrarYPaginar(); 
        },

        nextPage: () => {
            const totalPages = Math.ceil(visibleRows.length / rowsPerPage);
            if (currentPage < totalPages) { currentPage++; HistorialAPI.renderizarPagina(); }
        },

        prevPage: () => { if (currentPage > 1) { currentPage--; HistorialAPI.renderizarPagina(); } },

        // --- APERTURA Y RENDERIZADO DEL MODAL ---
        abrirModalDetalles: (id, folio, estado, fecha, proveedor) => {
            currentRemisionId = id; currentRemisionFolio = folio;
            
            let colorBadge = (estado == 'FINALIZADO') ? 'bg-emerald-100 text-emerald-700' : (estado == 'PENDIENTE' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700');
            
            document.getElementById('modalTitulo').innerText = '# ' + folio;
            document.getElementById('modalEstado').className = `px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${colorBadge}`;
            document.getElementById('modalEstado').innerText = estado;
            document.getElementById('modalSubtitulo').innerHTML = '📅 ' + fecha;
            
            let provStr = (proveedor || 'MANUAL').toUpperCase();
            let provFinal = 'custom';
            if(provStr.includes('PAOLA') || provStr.includes('OPERADORA')) provFinal = 'paola';
            else if(provStr.includes('TONY')) provFinal = 'tony';
            else if(provStr.includes('OPTIVOSA')) provFinal = 'optivosa';
            else if(provStr.includes('SINDESC')) provFinal = 'sindesc';
            
            const selProv = document.getElementById('sel_proveedor_modal');
            if(selProv) selProv.value = provFinal;
            
            document.getElementById('modalDetalles').showModal();
            document.getElementById('modalContenido').innerHTML = '<div class="flex flex-col justify-center items-center h-full text-slate-300 mt-20"><span class="loading loading-bars loading-lg text-indigo-400 mb-4"></span><span class="font-bold tracking-widest text-xs uppercase">Cargando Factura...</span></div>';
            
            const btnGuardar = document.getElementById('btnGuardarModal');
            if (estado === 'PENDIENTE') btnGuardar.classList.remove('hidden'); else btnGuardar.classList.add('hidden');

            fetch('api/api_leer_factura.php?id=' + id + '&t=' + Date.now()).then(r => r.json()).then(data => {
                if(data.success) {
                    dataCacheModal = data;
                    HistorialAPI.renderizarTablaModal();
                } else document.getElementById('modalContenido').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-xl font-bold">${data.error}</div>`;
            });
        },

        toggleZoomModal: () => { zoomModeModal = !zoomModeModal; HistorialAPI.renderizarTablaModal(); },
        recalcularTodoModal: () => { HistorialAPI.renderizarTablaModal(); },

        renderizarTablaModal: () => {
            if(!dataCacheModal) return;
            const data = dataCacheModal.datos;
            const estadoFactura = dataCacheModal.estado;
            const esEditable = (estadoFactura === 'PENDIENTE');
            const readOnlyAttr = esEditable ? '' : 'disabled';
            const z = zoomModeModal;

            let descGlobal = 5;
            const elDescGlobal = document.getElementById('inp_desc_global_modal');
            if (elDescGlobal) descGlobal = parseFloat(elDescGlobal.value) || 0;
            
            let provModal = 'custom';
            const selProv = document.getElementById('sel_proveedor_modal');
            if (selProv) provModal = selProv.value;

            const styles = {
                tiny: z ? 'text-sm font-bold text-slate-700' : 'text-[9px] 2xl:text-[10px] text-slate-400 font-extrabold tracking-wider',
                big: z ? 'text-5xl font-black text-slate-900' : 'text-2xl 2xl:text-3xl font-black text-slate-800',
                inputH: z ? 'h-16' : 'h-10 2xl:h-12',
                cardP: z ? 'p-8' : 'p-3 2xl:p-4',
                gap: z ? 'gap-6' : 'gap-3 2xl:gap-5',
                normal: z ? 'text-2xl font-black text-slate-800' : 'text-sm 2xl:text-base font-black text-slate-800'
            };
            
            let html = `<div class="w-full space-y-3 pb-20">`; 
            let idx = 0;
            
            for (const [remision, productos] of Object.entries(data)) {
                productos.forEach((p) => {
                    let cantFactura = p.cantidad || p.cant; 
                    let esPaquete = (p.es_paquete == 1);
                    let piezas = parseFloat(p.piezas_por_paquete || 1);
                    let claveFinal = p.clave_final || p.clave_sicar || '';
                    let fisico = parseFloat(p.existencia_lapiz || 0);

                    // LÓGICA DESCUENTOS
                    let tieneDescXML = (p.aplica_descuento == 1); 
                    let checkDesc = false;
                    if (provModal === 'paola') checkDesc = true;
                    else if (provModal === 'tony') checkDesc = tieneDescXML;
                    else if (provModal === 'sindesc') checkDesc = false;

                    if(p.aplica_descuento_manual !== undefined && p.aplica_descuento_manual !== null) {
                        checkDesc = (p.aplica_descuento_manual == '1');
                    }

                    let esDevuelto = (p.revision_pendiente == 2);
                    let esFaltante = (claveFinal === 'FALTANTE' || claveFinal === 'DEVOLUCION');
                    
                    let estiloCard = esDevuelto ? 'border-red-400 bg-red-50/50 shadow-red-100' : (esFaltante ? 'border-amber-300 bg-amber-50/40 opacity-80' : 'border-slate-100 bg-white');
                    let estiloInput = esDevuelto || esFaltante ? 'text-red-600' : 'text-indigo-600';

                    let adminHTML = '';
                    if(window.userRol === 'admin') {
                        let costoSis = parseFloat(p.costo_sistema_actual) || 0;
                        let ventaSis = parseFloat(p.precio_venta_sistema) || 0;
                        
                        let badgeCosto = costoSis > 0 
                            ? `<div class="mt-1 text-center w-full"><span class="${styles.tiny} text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded border border-orange-100 block truncate">Ant: ${fmtMoney(costoSis)}</span></div>` 
                            : `<div class="mt-1 bg-slate-100 text-slate-400 text-[9px] font-bold text-center rounded py-0.5 w-full uppercase tracking-widest">Nuevo</div>`;
                        
                        let displayVenta = ventaSis > 0 
                            ? `<div class="bg-amber-100 text-amber-800 text-[10px] font-black text-center rounded-lg py-1 border border-amber-200 mb-1 shadow-sm w-full">VTA: ${fmtMoney(ventaSis)}</div>` 
                            : `<div class="text-center text-slate-300 text-[9px] font-bold uppercase tracking-widest mb-1">Sin precio Vta</div>`;

                        let btnRechazar = !esDevuelto ? `<button class="w-full py-1 rounded-lg border border-red-200 text-red-500 font-bold text-[10px] uppercase hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center gap-1 shadow-sm h-6" onclick="HistorialAPI.rechazarItem(${p.id}, '${p.cod_prov}')" ${readOnlyAttr}><i class="bi bi-x-circle-fill"></i> Rechazar</button>` : `<div class="w-full py-1 rounded-lg bg-red-500 text-white font-black text-[10px] text-center uppercase tracking-widest shadow-sm shadow-red-200 h-6 flex items-center justify-center">REPORTADO</div>`;

                        adminHTML = `
                        <div class="w-full ${z ? '' : 'xl:w-72 2xl:w-80'} flex flex-col gap-2 border-l pl-4 border-slate-100 justify-center">
                            <div class="flex items-center gap-2 pb-2 border-b border-slate-50">
                                <label class="cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors shadow-sm h-6">
                                    <input type="checkbox" id="m_chk_desc_${idx}" class="w-3 h-3 accent-purple-600 rounded-sm cursor-pointer chk-desc-modal" value="1" ${checkDesc ? 'checked' : ''} onchange="HistorialAPI.calcularFilaModal(${idx})" ${readOnlyAttr}>
                                    <span class="font-extrabold text-[9px] text-purple-700 tracking-wider">-${descGlobal}% DTO</span>
                                </label>
                                <div class="flex-grow">${btnRechazar}</div>
                            </div>
                            <div class="flex gap-2">
                                <div class="bg-slate-50/50 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center w-1/2">
                                    <span class="${styles.tiny} text-slate-400">COSTO FINAL</span>
                                    <div class="flex items-center justify-center gap-0.5 mt-1 w-full"><span class="text-slate-400 font-black text-sm">$</span><input type="number" step="0.01" id="m_costo_manual_${idx}" class="w-full bg-transparent p-0 ${styles.big} font-black text-slate-700 text-center leading-none focus:outline-none focus:text-indigo-600 transition-colors" value="0.00" disabled></div>
                                    ${badgeCosto}
                                </div>
                                <div class="w-1/2 flex flex-col justify-end">
                                     ${displayVenta}
                                     <div class="grid grid-cols-2 gap-1 mt-auto">
                                        <div class="bg-blue-50/80 rounded-lg border border-blue-100 flex flex-col items-center justify-center py-1"><div class="text-[8px] font-extrabold text-blue-400 mb-0.5">20%</div><div id="m_lbl_p20_${idx}" class="font-black text-blue-700 text-xs tracking-tight">$0</div></div>
                                        <div class="bg-emerald-50/80 rounded-lg border border-emerald-100 flex flex-col items-center justify-center py-1"><div class="text-[8px] font-extrabold text-emerald-400 mb-0.5">30%</div><div id="m_lbl_p30_${idx}" class="font-black text-emerald-700 text-xs tracking-tight">$0</div></div>
                                     </div>
                                </div>
                            </div>
                        </div>`;
                    } else { adminHTML = `<div class="w-full xl:w-auto flex flex-col gap-2 items-end justify-center">${esDevuelto ? '<div class="bg-red-500 rounded-xl px-4 py-2 text-white font-black text-xs shadow-md shadow-red-200">REPORTADO</div>' : ''}</div>`; }

                    html += `
                    <div id="m_card_item_${idx}" class="glass-panel border ${estiloCard} hover:border-indigo-200 transition-all duration-300 rounded-3xl group relative overflow-hidden fila-modal" data-idx="${idx}" data-cod="${p.cod_prov}">
                        <div class="${styles.cardP} flex flex-col xl:flex-row ${styles.gap} items-stretch xl:items-center relative z-10">
                            <input type="hidden" id="m_costo_base_${idx}" value="${p.costo}">
                            
                            <div class="flex flex-row xl:flex-col items-center gap-3 border-b xl:border-b-0 xl:border-r border-slate-100 pb-3 xl:pb-0 xl:pr-4 w-full xl:w-auto justify-between xl:justify-center">
                                <div class="text-center">
                                    <label class="${styles.tiny} text-slate-400 mb-1 block">FACTURA</label>
                                    <input type="number" id="m_cant_${idx}" class="bg-slate-50 border-2 border-slate-100 focus:border-indigo-300 focus:bg-white rounded-xl text-center font-black ${styles.big} text-slate-700 p-0 ${z ? 'w-full' : 'w-16 2xl:w-20'} ${styles.inputH} outline-none transition-all" value="${cantFactura}" ${readOnlyAttr} onchange="HistorialAPI.calcularFilaModal(${idx})">
                                </div>
                                <div class="flex flex-col items-end xl:items-center">
                                    <label class="flex items-center gap-1.5 cursor-pointer group/box mb-1.5">
                                        <span class="${styles.tiny} group-hover/box:text-indigo-500 transition-colors">CAJA</span> 
                                        <div class="relative">
                                            <input type="checkbox" id="m_chk_paq_${idx}" class="peer sr-only" ${esPaquete ? 'checked' : ''} ${readOnlyAttr} onchange="HistorialAPI.calcularFilaModal(${idx})">
                                            <div class="block bg-slate-200 w-8 h-4 rounded-full peer-checked:bg-indigo-500 transition-colors"></div>
                                            <div class="dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                                        </div>
                                    </label>
                                    <div class="flex items-center gap-1 ${esPaquete ? '' : 'hidden'}" id="m_wrap_pz_${idx}">
                                        <input type="number" id="m_pz_${idx}" class="w-12 h-6 text-center font-bold text-xs bg-white border border-indigo-200 rounded-md focus:outline-none focus:border-indigo-500 text-indigo-700" value="${piezas}" ${readOnlyAttr} onchange="HistorialAPI.calcularFilaModal(${idx})">
                                        <span class="${styles.tiny}">pz</span>
                                    </div>
                                    <span id="m_lbl_total_${idx}" class="text-[10px] font-black mt-1 text-indigo-500 tracking-wide"></span>
                                </div>
                            </div>

                            <div class="flex-grow w-full xl:w-auto xl:flex-1 text-center xl:text-left min-w-0 flex flex-col justify-center">
                                <div class="${styles.normal} leading-snug mb-2 truncate break-words whitespace-normal">${p.desc}</div>
                                <div class="flex flex-wrap justify-center xl:justify-start gap-2 items-center">
                                    <div class="flex items-center bg-slate-100 rounded-lg px-2 py-1 border border-slate-200 group-hover:border-slate-300 transition-colors">
                                        <span class="font-mono text-slate-500 font-bold ${styles.tiny} cursor-pointer hover:text-indigo-600">${p.cod_prov}</span>
                                    </div>
                                    <div class="flex items-center shadow-sm border border-slate-200 rounded-lg overflow-hidden bg-white h-7 2xl:h-8">
                                        <span class="bg-slate-700 text-white px-2 flex items-center h-full text-[9px] font-extrabold uppercase tracking-widest">SICAR</span>
                                        <input type="text" id="m_sicar_${idx}" class="w-24 2xl:w-32 bg-transparent text-center font-mono font-bold text-xs outline-none px-2" value="${claveFinal}" list="dlSicar" placeholder="---" ${readOnlyAttr}>
                                    </div>
                                </div>
                            </div>

                            <div class="flex flex-col items-center bg-slate-50/80 p-3 rounded-2xl border-2 border-slate-100 w-full xl:w-24 2xl:w-28 shrink-0 relative transition-colors hover:border-slate-200">
                                <span class="${styles.tiny} text-slate-400 mb-1 text-center">FÍSICO</span>
                                <input type="number" step="any" id="m_fisico_${idx}" class="w-full bg-transparent text-center font-black ${styles.big} focus:outline-none ${estiloInput} p-0 transition-colors" value="${fisico}" ${readOnlyAttr} placeholder="0">
                                
                                <label class="absolute -bottom-3 bg-white border border-slate-200 shadow-sm rounded-lg px-2 py-1 flex items-center gap-1.5 cursor-pointer hover:border-red-300 transition-colors z-20">
                                    <input type="checkbox" id="m_chk_faltante_${idx}" class="w-3 h-3 accent-red-500 rounded-sm cursor-pointer" ${esFaltante ? 'checked' : ''} onchange="HistorialAPI.toggleFaltante(this, ${idx})" ${readOnlyAttr}>
                                    <span class="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">Faltante</span>
                                </label>
                            </div>
                            
                            ${adminHTML}
                        </div>
                    </div>`;
                    
                    setTimeout(() => HistorialAPI.calcularFilaModal(idx), 50);
                    idx++;
                });
            }
            html += `</div>`;
            document.getElementById('modalContenido').innerHTML = html;
        },

        toggleFaltante: (chk, idx) => {
            const inpSicar = document.getElementById(`m_sicar_${idx}`);
            const inpFisico = document.getElementById(`m_fisico_${idx}`);
            const card = document.getElementById(`m_card_item_${idx}`);
            
            if (chk.checked) {
                inpSicar.value = 'FALTANTE';
                inpFisico.value = 0;
                if (card) {
                    card.classList.remove('border-slate-100', 'bg-white');
                    card.classList.add('border-amber-300', 'bg-amber-50/40', 'opacity-80');
                }
                inpFisico.classList.remove('text-indigo-600');
                inpFisico.classList.add('text-red-600');
            } else {
                inpSicar.value = '';
                if (card) {
                    card.classList.remove('border-amber-300', 'bg-amber-50/40', 'opacity-80');
                    card.classList.add('border-slate-100', 'bg-white');
                }
                inpFisico.classList.remove('text-red-600');
                inpFisico.classList.add('text-indigo-600');
            }
            HistorialAPI.calcularFilaModal(idx);
        },

        calcularFilaModal: (idx) => {
            let descGlobal = 5;
            const elDescGlobal = document.getElementById('inp_desc_global_modal');
            if (elDescGlobal) descGlobal = parseFloat(elDescGlobal.value) || 0;

            const costoBase = parseFloat(document.getElementById(`m_costo_base_${idx}`)?.value || 0);
            const chkPaq = document.getElementById(`m_chk_paq_${idx}`);
            const inpPz = document.getElementById(`m_pz_${idx}`);
            const chkDesc = document.getElementById(`m_chk_desc_${idx}`);
            const inpCostoManual = document.getElementById(`m_costo_manual_${idx}`);
            const inpCant = document.getElementById(`m_cant_${idx}`);
            const lblTotal = document.getElementById(`m_lbl_total_${idx}`);
            const wrapperPz = document.getElementById(`m_wrap_pz_${idx}`);

            let costoFinal = costoBase;
            let esPaquete = chkPaq && chkPaq.checked;
            let piezas = inpPz ? (parseFloat(inpPz.value) || 1) : 1;

            if(esPaquete) {
                if(piezas < 1) piezas = 1;
                costoFinal = costoBase * piezas;
                if(wrapperPz) wrapperPz.classList.remove('hidden');
                let cantFactura = parseFloat(inpCant?.value || 0);
                let cajas = cantFactura / piezas;
                if(lblTotal) lblTotal.innerHTML = `<span class="text-indigo-600 font-black text-xs">= ${fmtInt(cajas)} CAJAS</span>`;
            } else {
                if(wrapperPz) wrapperPz.classList.add('hidden');
                if(lblTotal) lblTotal.innerText = "PIEZAS";
            }

            if(chkDesc && chkDesc.checked) {
                costoFinal *= (1 - (descGlobal / 100));
            }

            if(inpCostoManual) inpCostoManual.value = costoFinal.toFixed(2);
            
            const l20 = document.getElementById(`m_lbl_p20_${idx}`);
            const l30 = document.getElementById(`m_lbl_p30_${idx}`);
            if(l20) l20.innerText = fmtMoney(costoFinal * 1.20);
            if(l30) l30.innerText = fmtMoney(costoFinal * 1.30);
        },

        guardarCambiosModal: () => {
            const btn = document.getElementById('btnGuardarModal');
            const fd = new FormData();
            let cambios = 0;
            
            fd.append('remision_id', currentRemisionFolio);
            
            const filas = document.querySelectorAll('.fila-modal');
            filas.forEach((row) => {
                let i = row.getAttribute('data-idx');
                let cod_prov = row.getAttribute('data-cod');
                
                fd.append(`items[${i}][cod_prov]`, cod_prov);
                fd.append(`items[${i}][exis_lapiz]`, document.getElementById(`m_fisico_${i}`).value);
                fd.append(`items[${i}][cantidad_real]`, document.getElementById(`m_cant_${i}`).value);
                fd.append(`items[${i}][clave_final]`, document.getElementById(`m_sicar_${i}`).value);
                
                let esPaq = document.getElementById(`m_chk_paq_${i}`).checked ? 1 : 0;
                fd.append(`items[${i}][es_paquete]`, esPaq);
                fd.append(`items[${i}][piezas_por_paquete]`, document.getElementById(`m_pz_${i}`).value);
                
                // IVA se omite en la UI pero mandamos 0 para no romper backend
                fd.append(`items[${i}][aplica_iva]`, 0); 
                
                let chkDesc = document.getElementById(`m_chk_desc_${i}`);
                let desc = (chkDesc && chkDesc.checked) ? 1 : 0;
                fd.append(`items[${i}][aplica_descuento]`, desc);
                cambios++;
            });

            if(cambios === 0) return Swal.fire('Nada que guardar', '', 'info');

            btn.disabled = true; btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Guardando...';
            fetch('api/enviar_revision.php', { method: 'POST', body: fd }).then(r => r.json()).then(data => {
                if(data.success) {
                    Swal.fire({icon: 'success', title: 'Guardado', timer: 1500, showConfirmButton: false});
                    HistorialAPI.aplicarFiltrosGlobales(); 
                } else Swal.fire('Error', data.error, 'error');
            }).finally(() => { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save mr-2"></i> Guardar Cambios'; });
        },

        rechazarItem: (idItem, codigo) => {
            Swal.fire({
                title: '¿Rechazar Producto?', text: "Este producto se enviará a reporte de devoluciones", icon: 'warning',
                showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Sí, rechazar', cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    const fd = new FormData(); fd.append('id_item', idItem);
                    fetch('api/api_devolver_item.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => {
                        if(d.success) { 
                            Swal.fire('Guardado', 'Producto enviado a devoluciones', 'success');
                            document.getElementById('modalDetalles').close();
                            HistorialAPI.aplicarFiltrosGlobales();
                        } else Swal.fire('Error', d.error, 'error');
                    });
                }
            });
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
                showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar permanentemente', cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    let fd = new FormData(); fd.append('id', id);
                    fetch('api/eliminar_remision.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => {
                        if(d.success) Swal.fire('Eliminado', 'Registro borrado.', 'success').then(() => HistorialAPI.aplicarFiltrosGlobales());
                        else Swal.fire('Error', d.error, 'error');
                    });
                }
            });
        }
    };

    HistorialAPI.init();
})();
</script>
<datalist id="dlSicar"><?php try { $st = $pdo->query("SELECT clave_sicar FROM cat_productos LIMIT 2000"); while ($r = $st->fetch()) { echo "<option value='{$r['clave_sicar']}'>"; } } catch (Exception $e) {} ?></datalist>