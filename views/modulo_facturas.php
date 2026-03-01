<?php
// views/modulo_facturas.php
session_start();
require_once '../config/db.php';
$rol = $_SESSION['rol'] ?? 'empleado';
?>
<script>window.userRol = '<?= $rol ?>';</script>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>

<style>
    /* Diseño Moderno 2026 */
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
    
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .transition-all-elements, .transition-all-elements * { transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
    #mainContainer { overflow-x: hidden; }
    
    /* Scrollbar minimalista */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    
    /* Efectos Glassmorphism y sombras suaves */
    .glass-panel { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6); }
    .shadow-soft { box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); }
    
    /* SweetAlert 2026 Overrides */
    div:where(.swal2-container) button:where(.swal2-styled).swal2-confirm { background: linear-gradient(135deg, #4f46e5, #3b82f6) !important; color: white !important; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3) !important; border-radius: 12px !important; }
    div:where(.swal2-container) button:where(.swal2-styled).swal2-cancel { background-color: #f1f5f9 !important; color: #64748b !important; margin-right: 10px; border-radius: 12px !important; }
    div:where(.swal2-container) div:where(.swal2-popup) { border-radius: 24px !important; font-family: 'Plus Jakarta Sans', sans-serif !important; }
</style>

<div class="toast toast-bottom toast-end z-[9999]" id="toastContainer"></div>

<div class="relative h-[calc(100vh-1rem)] bg-slate-50 font-sans text-sm overflow-hidden flex transition-all-elements text-slate-800 selection:bg-indigo-100">
    
    <div id="panelLista" class="w-full md:w-80 flex-shrink-0 bg-white/80 backdrop-blur-xl border-r border-slate-200 flex flex-col h-full z-20 transition-transform duration-300 absolute md:relative shadow-sm">
        <div class="p-5 border-b border-slate-100 sticky top-0 z-10 h-20 flex justify-between items-center bg-white/50 backdrop-blur-md">
            <div>
                <h2 class="font-extrabold text-xl text-slate-800 tracking-tight leading-none">Tareas</h2>
                <span class="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">Recepción Activa</span>
            </div>
            <div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs"><i class="bi bi-card-list text-lg"></i></div>
            <div class="md:hidden text-xs text-slate-400 font-medium cursor-pointer" onclick="FacturasAPI.cerrarDetalle()">Ocultar</div>
        </div>
        <div class="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar" id="contenedorListaTareas">
            <?php
            try {
                $sql = "SELECT id, numero_remision, proveedor, fecha_carga, estado, (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id) as items FROM historial_remisiones hr WHERE estado IN ('PENDIENTE', 'ENVIADO', 'REVISION') ORDER BY fecha_carga DESC";
                $stmt = $pdo->query($sql);
                if ($stmt->rowCount() == 0) echo '<div class="flex flex-col items-center justify-center h-40 opacity-40 text-slate-400"><i class="bi bi-check2-circle text-5xl mb-2"></i><span class="font-bold tracking-wide">Todo al día</span></div>';
                while ($row = $stmt->fetch()):
                    $border = ($row['estado'] === 'REVISION') ? 'border-amber-400' : 'border-indigo-400';
                    $badge = ($row['estado'] === 'REVISION') ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
                    $p = strtoupper($row['proveedor'] ?? '');
                    $iconProv = ($p === 'TONY') ? '🐯' : (($p === 'PAOLA' || $p === 'OPERADORA') ? '📄' : (($p === 'OPTIVOSA') ? '👓' : (($p === 'SINDESC') ? '🚫' : '📦')));
                    $provJs = !empty($row['proveedor']) ? $row['proveedor'] : 'MANUAL';
            ?>
                <div class="bg-white border border-slate-100 border-l-4 <?= $border ?> shadow-sm hover:shadow-md hover:border-indigo-100 cursor-pointer transition-all duration-300 rounded-2xl p-4 group active:scale-[0.98]" onclick="FacturasAPI.iniciarCarga(<?= $row['id'] ?>, '<?= $provJs ?>')">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="font-black text-slate-800 text-base group-hover:text-indigo-600 transition-colors tracking-tight"><?= htmlspecialchars($row['numero_remision']) ?></h3>
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider <?= $badge ?>"><?= $row['estado'] ?></span>
                    </div>
                    <div class="flex justify-between items-center text-xs text-slate-500 font-medium">
                        <span><?= $iconProv ?> <?= date('d M • H:i', strtotime($row['fecha_carga'])) ?></span>
                        <span class="bg-slate-50 px-2 py-1 rounded-lg font-bold text-[10px] text-slate-600 uppercase tracking-widest border border-slate-100"><?= $row['items'] ?> items</span>
                    </div>
                </div>
            <?php endwhile; } catch (Exception $e) {} ?>
        </div>
    </div>

    <div id="panelDetalle" class="w-full flex flex-col h-full absolute md:relative translate-x-full md:translate-x-0 transition-transform duration-300 z-30 bg-slate-50/50">
        
        <div class="px-4 pt-4 shrink-0 z-40 sticky top-0">
            <div class="glass-panel rounded-3xl min-h-[4rem] px-5 flex flex-wrap gap-3 justify-between items-center shadow-sm">
                <div class="flex items-center gap-3">
                    <button class="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 md:hidden transition-colors" onclick="FacturasAPI.cerrarDetalle()"><i class="bi bi-arrow-left text-lg"></i></button>
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200 hidden md:flex">
                        <i class="bi bi-clipboard-check-fill text-white text-lg"></i>
                    </div>
                    <div>
                        <h1 class="font-black text-xl text-slate-800 leading-none tracking-tight" id="headerTitulo">Recepción</h1>
                        <span class="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest hidden sm:block mt-0.5">Auditoría de Inventario</span>
                    </div>
                </div>
                
                <div id="toolbarGlobal" class="hidden md:flex items-center gap-3">
                    <?php if ($rol === 'admin'): ?>
                    <div class="flex items-center bg-white rounded-xl border border-slate-200 px-3 py-1.5 shadow-sm">
                        <span class="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mr-2">PROVEEDOR</span>
                        <select id="sel_proveedor_global" class="bg-transparent font-bold text-slate-700 text-xs focus:outline-none cursor-pointer" onchange="FacturasAPI.cambiarProveedorManual(this.value)">
                            <option value="custom">🖐 Manual</option>
                            <option value="paola">📄 Paola/Oper.</option>
                            <option value="tony">🐯 Tony</option>
                            <option value="optivosa">👓 Optivosa</option>
                            <option value="sindesc">🚫 Sin Descuentos</option>
                        </select>
                    </div>
                    
                    <div class="flex items-center bg-purple-50 rounded-xl border border-purple-200 px-3 py-1.5 shadow-sm" title="Descuento Adicional">
                        <span class="text-[9px] font-extrabold uppercase tracking-widest text-purple-500 mr-1">DTO %</span>
                        <input type="number" id="inp_desc_global" value="5" class="w-8 bg-transparent font-black text-purple-700 text-sm focus:outline-none text-center" onchange="FacturasAPI.renderizarTodo()">
                    </div>
                    <?php endif; ?>
                    
                    <button id="btnZoom" class="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 flex items-center justify-center shadow-sm transition-all active:scale-95" onclick="FacturasAPI.toggleZoom()" title="Modo Lectura A+"><i class="bi bi-type-h1 text-lg"></i></button>
                    
                    <?php if ($rol === 'admin'): ?>
                        <button class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2 hidden md:flex" onclick="document.getElementById('modalSubir').showModal()">
                            <i class="bi bi-cloud-arrow-up-fill"></i> <span class="hidden sm:inline">Subir XML</span>
                        </button>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <div class="flex-grow overflow-y-auto p-4 md:p-6" id="mainContainer">
            <div id="zonaResultados" class="pb-24 w-full max-w-[1920px] mx-auto">
                <div class="flex flex-col items-center justify-center h-full text-slate-300 mt-32">
                    <i class="bi bi-inboxes text-8xl mb-4 opacity-50"></i>
                    <p class="text-xl font-bold tracking-tight text-slate-400">Selecciona una tarea de la lista para comenzar</p>
                </div>
            </div>
        </div>
    </div>
</div>

<dialog id="modalSeleccionProveedor" class="modal modal-bottom sm:modal-middle">
    <div class="modal-box bg-white rounded-3xl p-8">
        <h3 class="font-black text-2xl text-slate-800 text-center mb-6 tracking-tight">Selecciona Proveedor</h3>
        <select id="selProvModal" class="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 text-lg focus:outline-none focus:border-indigo-500 transition-colors mb-8 cursor-pointer">
            <option value="" disabled selected>-- Elige una regla de precios --</option>
            <option value="paola">📄 Paola / Operadora</option>
            <option value="tony">🐯 Tony</option>
            <option value="optivosa">👓 Optivosa</option>
            <option value="sindesc">🚫 Sin Descuentos</option>
        </select>
        <div class="flex justify-between w-full gap-4">
            <button class="flex-1 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors" onclick="FacturasAPI.cancelarCarga()">Cancelar</button>
            <button class="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors" onclick="FacturasAPI.confirmarProveedor()">Confirmar Regla</button>
        </div>
    </div>
</dialog>

<dialog id="modalSubir" class="modal">
    <div class="modal-box bg-white rounded-3xl">
        <h3 class="font-black text-xl text-slate-800 tracking-tight">Cargar XML / CSV</h3>
        <form id="formUploadModal" class="mt-6">
            <input type="file" name="archivo_factura[]" multiple class="file-input file-input-bordered w-full bg-slate-50 focus:outline-none border-slate-200 rounded-xl" accept=".csv,.xml" />
            <div class="modal-action mt-8">
                <form method="dialog"><button class="btn btn-ghost rounded-xl font-bold text-slate-500">Cancelar</button></form>
                <button type="button" class="btn bg-indigo-600 text-white rounded-xl font-bold border-none hover:bg-indigo-700 shadow-md" onclick="FacturasAPI.submitUploadForm()">Procesar Archivos</button>
            </div>
        </form>
    </div>
</dialog>

<script>
    (() => {
        const fmtMoney = (n) => parseFloat(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
        const fmtInt = (n) => parseFloat(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });

        window.FacturasAPI = {
            currentId: null, currentRemisionCode: null, currentProveedor: null, dataCache: null, zoomMode: false,

            showToast: (msg, type = 'success') => {
                const container = document.getElementById('toastContainer');
                const alertClass = type === 'success' ? 'bg-emerald-500' : 'bg-red-500';
                const icon = type === 'success' ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-exclamation-triangle-fill"></i>';
                const toast = document.createElement('div');
                toast.className = `${alertClass} text-white shadow-xl shadow-slate-300/50 flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold min-w-[250px] mb-2 animate-bounce-in`;
                toast.innerHTML = `${icon} <span>${msg}</span>`;
                container.appendChild(toast);
                setTimeout(() => { toast.remove(); }, 3000);
            },

            limpiarDetalle: () => {
                document.getElementById('headerTitulo').innerText = 'Recepción';
                document.getElementById('zonaResultados').innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full text-slate-300 mt-32">
                        <i class="bi bi-inboxes text-8xl mb-4 opacity-50"></i>
                        <p class="text-xl font-bold tracking-tight text-slate-400">Selecciona una tarea de la lista para comenzar</p>
                    </div>`;
                FacturasAPI.currentId = null;
                FacturasAPI.currentRemisionCode = null;
                FacturasAPI.currentProveedor = null;
            },

            iniciarCarga: (id, proveedorBD) => {
                FacturasAPI.currentId = id;
                FacturasAPI.currentProveedor = null;
                document.getElementById('panelDetalle').classList.remove('translate-x-full');
                document.getElementById('zonaResultados').innerHTML = '<div class="flex flex-col items-center justify-center p-32"><div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div><span class="text-slate-400 font-bold tracking-widest text-xs uppercase">Cargando datos...</span></div>';

                const selGlobal = document.getElementById('sel_proveedor_global');
                if(selGlobal) selGlobal.value = 'custom';

                let provStr = (proveedorBD || 'MANUAL').toUpperCase();
                let provFinal = 'custom';
                if(provStr.includes('PAOLA') || provStr.includes('OPERADORA')) provFinal = 'paola';
                else if(provStr.includes('TONY')) provFinal = 'tony';
                else if(provStr.includes('OPTIVOSA')) provFinal = 'optivosa';
                else if(provStr.includes('SINDESC')) provFinal = 'sindesc'; 

                if(window.userRol === 'admin' && (provFinal === 'custom' || provStr === 'MANUAL')) {
                    const modal = document.getElementById('modalSeleccionProveedor');
                    const sel = document.getElementById('selProvModal');
                    sel.selectedIndex = 0; if(modal.open) modal.close(); modal.showModal();
                } else {
                    FacturasAPI.confirmarProveedor(provFinal);
                }
            },

            confirmarProveedor: (proveedorDirecto = null) => {
                let p = proveedorDirecto;
                if(!p) {
                    const sel = document.getElementById('selProvModal');
                    if(!sel.value) return FacturasAPI.showToast('Selecciona un proveedor', 'error');
                    p = sel.value;
                    const fd = new FormData(); fd.append('id_remision', FacturasAPI.currentId); fd.append('proveedor', p);
                    fetch('api/api_asignar_proveedor.php', { method: 'POST', body: fd });
                    document.getElementById('modalSeleccionProveedor').close();
                }
                FacturasAPI.currentProveedor = p;
                const selGlobal = document.getElementById('sel_proveedor_global');
                if(selGlobal) selGlobal.value = p;
                FacturasAPI.fetchDatos();
            },

            cancelarCarga: () => { document.getElementById('modalSeleccionProveedor').close(); FacturasAPI.cerrarDetalle(); },
            cerrarDetalle: () => { document.getElementById('panelDetalle').classList.add('translate-x-full'); },

            fetchDatos: () => {
                fetch('api/api_leer_factura.php?id=' + FacturasAPI.currentId + '&t=' + Date.now()).then(r => r.json()).then(data => {
                    if (data.success) { FacturasAPI.dataCache = data; FacturasAPI.renderizarTodo(); } else { FacturasAPI.showToast(data.error, 'error'); }
                });
            },

            renderizarTodo: () => {
                if(!FacturasAPI.dataCache) return;
                const data = FacturasAPI.dataCache.datos;
                const estado = FacturasAPI.dataCache.estado;
                FacturasAPI.currentRemisionCode = Object.keys(data)[0];
                document.getElementById('headerTitulo').innerText = `Orden #${FacturasAPI.currentRemisionCode}`;
                const esFinalizada = (estado === 'FINALIZADO');
                const readOnlyAttr = esFinalizada ? 'disabled' : '';
                const z = FacturasAPI.zoomMode;

                // LECTURA DE DESCUENTO GLOBAL
                let descGlobal = 5;
                const elDescGlobal = document.getElementById('inp_desc_global');
                if (elDescGlobal) descGlobal = parseFloat(elDescGlobal.value) || 0;

                const styles = {
                    tiny: z ? 'text-sm font-bold text-slate-700' : 'text-[9px] 2xl:text-[10px] text-slate-400 font-extrabold tracking-wider',
                    big: z ? 'text-5xl font-black text-slate-900' : 'text-2xl 2xl:text-3xl font-black text-slate-800',
                    inputH: z ? 'h-16' : 'h-10 2xl:h-12',
                    cardP: z ? 'p-8' : 'p-3 2xl:p-4',
                    gap: z ? 'gap-6' : 'gap-3 2xl:gap-5',
                    normal: z ? 'text-2xl font-black text-slate-800' : 'text-sm 2xl:text-base font-black text-slate-800'
                };

                let html = `<div id="contenedorInputs" class="w-full space-y-3 pb-32"><input type="hidden" name="remision_id" value="${FacturasAPI.currentRemisionCode}" class="data-input">`;
                let i = 0;
                let filasParaCalcular = [];

                for (const [remision, productos] of Object.entries(data)) {
                    productos.forEach(p => {
                        let cantFactura = p.cantidad || p.cant; 
                        let esPaquete = p.es_paquete == '1';
                        let piezas = p.piezas_por_paquete || 1;
                        let claveFinal = p.clave_final || p.clave_sicar || '';
                        let fisico = p.existencia_lapiz || 0;
                        
                        let tieneDescXML = p.aplica_descuento == 1; 
                        let checkDesc = false;
                        if (FacturasAPI.currentProveedor === 'paola') checkDesc = true;
                        else if (FacturasAPI.currentProveedor === 'tony') checkDesc = tieneDescXML;
                        else if (FacturasAPI.currentProveedor === 'sindesc') checkDesc = false;

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

                            let btnRechazar = !esFinalizada && !esDevuelto ? `<button class="w-full py-1 rounded-lg border border-red-200 text-red-500 font-bold text-[10px] uppercase hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center gap-1 shadow-sm h-6" onclick="FacturasAPI.rechazar(${p.id}, '${p.cod_prov}')"><i class="bi bi-x-circle-fill"></i> Rechazar</button>` : (esDevuelto ? `<div class="w-full py-1 rounded-lg bg-red-500 text-white font-black text-[10px] text-center uppercase tracking-widest shadow-sm shadow-red-200 h-6 flex items-center justify-center">REPORTADO</div>` : '');

                            adminHTML = `
                            <div class="w-full ${z ? '' : 'xl:w-72 2xl:w-80'} flex flex-col gap-2 border-l pl-4 border-slate-100 justify-center">
                                <div class="flex items-center gap-2 pb-2 border-b border-slate-50">
                                    <label class="cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors shadow-sm h-6">
                                        <input type="checkbox" id="chk_desc_${i}" data-idx="${i}" data-id-item="${p.id}" class="w-3 h-3 accent-purple-600 rounded-sm cursor-pointer data-input" value="1" ${checkDesc ? 'checked' : ''} onchange="FacturasAPI.calculoEnVivo(${i}, true)">
                                        <span class="font-extrabold text-[9px] text-purple-700 tracking-wider">-${descGlobal}% DTO</span>
                                    </label>
                                    <div class="flex-grow">${btnRechazar}</div>
                                </div>
                                <div class="flex gap-2">
                                    <div class="bg-slate-50/50 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center w-1/2">
                                        <span class="${styles.tiny} text-slate-400">COSTO FINAL</span>
                                        <div class="flex items-center justify-center gap-0.5 mt-1 w-full"><span class="text-slate-400 font-black text-sm">$</span><input type="number" step="0.01" id="inp_costo_manual_${i}" data-idx="${i}" data-id-item="${p.id}" class="w-full bg-transparent p-0 ${styles.big} font-black text-slate-700 text-center leading-none focus:outline-none focus:text-indigo-600 transition-colors" value="0.00" onchange="FacturasAPI.guardarCampo(this, 'costo_unitario')"></div>
                                        ${badgeCosto}
                                    </div>
                                    <div class="w-1/2 flex flex-col justify-end">
                                         ${displayVenta}
                                         <div class="grid grid-cols-2 gap-1 mt-auto">
                                            <div class="bg-blue-50/80 rounded-lg border border-blue-100 flex flex-col items-center justify-center py-1"><div class="text-[8px] font-extrabold text-blue-400 mb-0.5">20%</div><div id="lbl_20_${i}" class="font-black text-blue-700 text-xs tracking-tight">$0</div></div>
                                            <div class="bg-emerald-50/80 rounded-lg border border-emerald-100 flex flex-col items-center justify-center py-1"><div class="text-[8px] font-extrabold text-emerald-400 mb-0.5">30%</div><div id="lbl_30_${i}" class="font-black text-emerald-700 text-xs tracking-tight">$0</div></div>
                                         </div>
                                    </div>
                                </div>
                            </div>`;
                        } else { adminHTML = `<div class="w-full xl:w-auto flex flex-col gap-2 items-end justify-center">${esDevuelto ? '<div class="bg-red-500 rounded-xl px-4 py-2 text-white font-black text-xs shadow-md shadow-red-200">REPORTADO</div>' : ''}</div>`; }

                        html += `<div id="card_item_${i}" class="glass-panel border ${estiloCard} hover:border-indigo-200 transition-all duration-300 rounded-3xl group relative overflow-hidden" data-idx="${i}">
                            
                            <div class="${styles.cardP} flex ${z ? 'flex-col' : 'flex-col xl:flex-row'} ${styles.gap} items-stretch xl:items-center relative z-10">
                                <input type="hidden" id="hidden_costo_${i}" value="${p.costo}">
                                
                                <div class="flex flex-row xl:flex-col items-center gap-3 border-b xl:border-b-0 xl:border-r border-slate-100 pb-3 xl:pb-0 xl:pr-4 w-full ${z ? '' : 'xl:w-auto'} justify-between xl:justify-center">
                                    <div class="text-center">
                                        <label class="${styles.tiny} text-slate-400 mb-1 block">FACTURA</label>
                                        <input type="number" id="inp_cant_${i}" data-id-item="${p.id}" class="bg-slate-50 border-2 border-slate-100 focus:border-indigo-300 focus:bg-white rounded-xl text-center font-black ${styles.big} text-slate-700 p-0 ${z ? 'w-full' : 'w-16 2xl:w-20'} ${styles.inputH} outline-none transition-all data-input" value="${cantFactura}" ${readOnlyAttr} onchange="FacturasAPI.calculoEnVivo(${i}, true); FacturasAPI.guardarCampo(this, 'cantidad_real')">
                                    </div>
                                    <div class="flex flex-col items-end xl:items-center">
                                        <label class="flex items-center gap-1.5 cursor-pointer group/box mb-1.5">
                                            <span class="${styles.tiny} group-hover/box:text-indigo-500 transition-colors">CAJA</span> 
                                            <div class="relative">
                                                <input type="checkbox" id="chk_paq_${i}" data-idx="${i}" data-id-item="${p.id}" class="peer sr-only" ${esPaquete ? 'checked' : ''} ${readOnlyAttr} onchange="FacturasAPI.calculoEnVivo(${i}, true)">
                                                <div class="block bg-slate-200 w-8 h-4 rounded-full peer-checked:bg-indigo-500 transition-colors"></div>
                                                <div class="dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                                            </div>
                                        </label>
                                        <div class="flex items-center gap-1 ${esPaquete ? '' : 'hidden'}" id="wrap_pz_${i}">
                                            <input type="number" id="inp_pz_${i}" data-id-item="${p.id}" class="w-12 h-6 text-center font-bold text-xs bg-white border border-indigo-200 rounded-md focus:outline-none focus:border-indigo-500 text-indigo-700" value="${piezas}" ${readOnlyAttr} onchange="FacturasAPI.calculoEnVivo(${i}, true)">
                                            <span class="${styles.tiny}">pz</span>
                                        </div>
                                        <span id="lbl_total_${i}" class="text-[10px] font-black mt-1 text-indigo-500 tracking-wide"></span>
                                    </div>
                                </div>

                                <div class="flex-grow w-full ${z ? '' : 'xl:w-auto xl:flex-1'} text-center xl:text-left min-w-0 flex flex-col justify-center">
                                    <div class="${styles.normal} leading-snug mb-2 truncate break-words whitespace-normal">${p.desc}</div>
                                    <div class="flex flex-wrap justify-center xl:justify-start gap-2 items-center">
                                        
                                        <div class="flex items-center bg-slate-100 rounded-lg pl-2 pr-1 py-1 border border-slate-200 group-hover:border-slate-300 transition-colors">
                                            <span class="font-mono text-slate-500 font-bold ${styles.tiny} mr-2 cursor-pointer hover:text-indigo-600" onclick="navigator.clipboard.writeText('${p.cod_prov}')">${p.cod_prov}</span>
                                            <button class="bg-white rounded-md w-5 h-5 flex items-center justify-center shadow-sm text-slate-400 hover:text-indigo-600 transition-colors" onclick="FacturasAPI.verCodigoBarras('${p.cod_prov}', '${p.desc.replace(/'/g, "")}')"><i class="bi bi-upc-scan text-[10px]"></i></button>
                                        </div>
                                        
                                        <div class="flex items-center shadow-sm border border-slate-200 rounded-lg overflow-hidden bg-white h-7 2xl:h-8">
                                            <span class="bg-slate-700 text-white px-2 flex items-center h-full text-[9px] font-extrabold uppercase tracking-widest">SICAR</span>
                                            <input type="text" id="inp_sicar_${i}" class="w-24 2xl:w-32 bg-transparent text-center font-mono font-bold text-xs outline-none px-2 data-input" data-id-item="${p.id}" value="${claveFinal}" list="dlSicar" placeholder="---" ${readOnlyAttr} onchange="FacturasAPI.guardarCampo(this, 'clave_final')">
                                        </div>
                                    </div>
                                    <input type="hidden" name="items[${i}][cod_prov]" value="${p.cod_prov}" class="data-input">
                                </div>

                                <div class="flex flex-col items-center bg-slate-50/80 p-3 rounded-2xl border-2 border-slate-100 ${z ? 'w-full' : 'w-24 2xl:w-28'} shrink-0 relative group/fisico transition-colors hover:border-slate-200">
                                    <span id="lbl_instr_${i}" class="${styles.tiny} text-slate-400 mb-1 text-center">FÍSICO</span>
                                    <input type="number" step="any" id="inp_fisico_${i}" class="w-full bg-transparent text-center font-black ${styles.big} focus:outline-none data-input ${estiloInput} p-0 transition-colors" data-id-item="${p.id}" value="${fisico}" ${readOnlyAttr} placeholder="0" onchange="FacturasAPI.guardarCampo(this, 'existencia_lapiz')">
                                    
                                    <label class="absolute -bottom-3 bg-white border border-slate-200 shadow-sm rounded-lg px-2 py-1 flex items-center gap-1.5 cursor-pointer hover:border-red-300 transition-colors z-20">
                                        <input type="checkbox" id="chk_faltante_${i}" class="w-3 h-3 accent-red-500 rounded-sm cursor-pointer" ${esFaltante ? 'checked' : ''} onchange="FacturasAPI.toggleFaltante(this, ${i}, ${p.id})" ${readOnlyAttr}>
                                        <span class="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">Faltante</span>
                                    </label>
                                </div>
                                
                                ${adminHTML}
                            </div>
                        </div>`;
                        filasParaCalcular.push(i);
                        i++;
                    });
                }
                html += `</div>`;
                
                if (esFinalizada) {
                    html += `<div class="fixed bottom-6 right-6 z-50"><button class="bg-slate-800 text-white font-bold px-6 py-3 rounded-2xl shadow-xl shadow-slate-300 flex items-center gap-2 cursor-default"><i class="bi bi-check2-all text-lg"></i> Finalizado</button></div>`;
                } else {
                    if (window.userRol !== 'admin') {
                        html += `<div class="fixed bottom-6 right-6 z-50"><button onclick="FacturasAPI.guardarAvance()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl shadow-xl shadow-indigo-300 transition-all active:scale-95 flex items-center gap-2"><i class="bi bi-save text-lg"></i> Guardar Avance</button></div>`;
                    } else {
                        html += `<div class="fixed bottom-6 right-6 z-50 flex gap-3">
                            <button onclick="FacturasAPI.guardarYValidar()" class="bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-black px-6 py-3 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-2"><i class="bi bi-file-earmark-spreadsheet text-lg"></i> Validar Excel</button>
                            <button onclick="FacturasAPI.finalizar()" class="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-8 py-3 rounded-2xl shadow-xl shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2 tracking-wide"><i class="bi bi-check-lg text-lg"></i> Finalizar</button>
                        </div>`;
                    }
                }
                document.getElementById('zonaResultados').innerHTML = html;
                filasParaCalcular.forEach(idx => FacturasAPI.calculoEnVivo(idx, false));
            },

            // FIX: Función Faltante SIN recargar la página (Manipulación del DOM en vivo)
            toggleFaltante: (chk, idx, idItem) => {
                const inpSicar = document.getElementById(`inp_sicar_${idx}`);
                const inpFisico = document.getElementById(`inp_fisico_${idx}`);
                const card = document.getElementById(`card_item_${idx}`);
                
                if (chk.checked) {
                    // Acción Frontend
                    inpSicar.value = 'FALTANTE';
                    inpFisico.value = 0;
                    if (card) {
                        card.classList.remove('border-slate-100', 'bg-white');
                        card.classList.add('border-amber-300', 'bg-amber-50/40', 'opacity-80');
                    }
                    inpFisico.classList.remove('text-indigo-600');
                    inpFisico.classList.add('text-red-600');
                    
                    // Acción Backend
                    FacturasAPI.guardarCampo(inpSicar, 'clave_final', 'FALTANTE');
                    FacturasAPI.guardarCampo(inpFisico, 'existencia_lapiz', 0);
                    FacturasAPI.showToast('Artículo marcado como faltante', 'error');
                } else {
                    // Reversión Frontend
                    inpSicar.value = '';
                    if (card) {
                        card.classList.remove('border-amber-300', 'bg-amber-50/40', 'opacity-80');
                        card.classList.add('border-slate-100', 'bg-white');
                    }
                    inpFisico.classList.remove('text-red-600');
                    inpFisico.classList.add('text-indigo-600');
                    
                    // Reversión Backend
                    FacturasAPI.guardarCampo(inpSicar, 'clave_final', '');
                }
                
                // Forzamos un recálculo simple por si acaso, sin redibujar HTML
                FacturasAPI.calculoEnVivo(idx, false);
            },

            guardarAvance: () => {
                FacturasAPI.showToast('Avance guardado correctamente');
                FacturasAPI.refrescarLista();
            },

            calculoEnVivo: (idx, guardar = false) => {
                // Leer Descuento Global actual
                let descGlobal = 5;
                const elDescGlobal = document.getElementById('inp_desc_global');
                if (elDescGlobal) descGlobal = parseFloat(elDescGlobal.value) || 0;

                const elCostoBase = document.getElementById(`hidden_costo_${idx}`);
                if(!elCostoBase) return;
                const costoBase = parseFloat(elCostoBase.value) || 0;
                const chkPaq = document.getElementById(`chk_paq_${idx}`);
                const inpPz = document.getElementById(`inp_pz_${idx}`);
                const chkDesc = document.getElementById(`chk_desc_${idx}`);
                const inpCostoManual = document.getElementById(`inp_costo_manual_${idx}`);
                const inpCant = document.getElementById(`inp_cant_${idx}`);
                const lblTotal = document.getElementById(`lbl_total_${idx}`);
                const wrapperPz = document.getElementById(`wrap_pz_${idx}`);

                let costoFinal = costoBase;
                let esPaquete = chkPaq.checked;
                let piezas = parseFloat(inpPz.value) || 1;

                if(esPaquete) {
                    if(piezas < 1) piezas = 1;
                    costoFinal = costoBase * piezas;
                    wrapperPz.classList.remove('hidden');
                    let cantFactura = parseFloat(inpCant.value) || 0;
                    let cajas = cantFactura / piezas;
                    lblTotal.innerHTML = `<span class="text-indigo-600 font-black text-xs">= ${fmtInt(cajas)} CAJAS</span>`;
                } else {
                    wrapperPz.classList.add('hidden');
                    lblTotal.innerText = "PIEZAS";
                }

                // APLICA LA REGLA DEL PORCENTAJE DINÁMICO
                if(chkDesc && chkDesc.checked) {
                    costoFinal *= (1 - (descGlobal / 100));
                }

                if(inpCostoManual) inpCostoManual.value = costoFinal.toFixed(2);
                
                const l20 = document.getElementById(`lbl_20_${idx}`);
                const l30 = document.getElementById(`lbl_30_${idx}`);
                if(l20) l20.innerText = fmtMoney(costoFinal * 1.20);
                if(l30) l30.innerText = fmtMoney(costoFinal * 1.30);

                if(guardar) {
                    FacturasAPI.guardarCampo(chkPaq, 'es_paquete', esPaquete ? 1 : 0);
                    FacturasAPI.guardarCampo(inpPz, 'piezas_por_paquete');
                    if(chkDesc) FacturasAPI.guardarCampo(chkDesc, 'aplica_descuento_manual', chkDesc.checked ? 1 : 0);
                    if(inpCostoManual) FacturasAPI.guardarCampo(inpCostoManual, 'costo_unitario', costoFinal);
                }
            },

            guardarCampo: (el, campo, valorForzado = null) => {
                if(!el) return;
                const idItem = el.getAttribute('data-id-item');
                let valor = valorForzado !== null ? valorForzado : el.value;
                if (typeof valor === 'string') valor = valor.trim();
                const fd = new FormData();
                fd.append('id_item', idItem); fd.append('campo', campo); fd.append('valor', valor);
                fetch('api/api_actualizar_campo.php', { method: 'POST', body: fd });
            },

            actualizarPrecioManual: (el) => {
                const idx = el.getAttribute('data-idx');
                const val = parseFloat(el.value) || 0;
                const l20 = document.getElementById(`lbl_20_${idx}`);
                const l30 = document.getElementById(`lbl_30_${idx}`);
                if(l20) l20.innerText = fmtMoney(val * 1.20);
                if(l30) l30.innerText = fmtMoney(val * 1.30);
                FacturasAPI.guardarCampo(el, 'costo_unitario');
            },

            cambiarProveedorManual: (val) => {
                const fd = new FormData(); fd.append('id_remision', FacturasAPI.currentId); fd.append('proveedor', val);
                fetch('api/api_asignar_proveedor.php', { method: 'POST', body: fd }).then(() => {
                    FacturasAPI.currentProveedor = val; FacturasAPI.renderizarTodo();
                });
            },
            
            guardarYValidar: () => { 
                if (document.activeElement) {
                    document.activeElement.blur(); 
                }
                
                Swal.fire({ 
                    title: 'Calculando Totales...', 
                    text: 'Sumando factura + físico y agrupando códigos',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); } 
                });
                
                setTimeout(() => {
                    let f = document.createElement('form'); 
                    f.method = 'POST'; 
                    f.action = 'api/generar_sicar_final.php'; 
                    let i = document.createElement('input'); 
                    i.type = 'hidden'; 
                    i.name = 'remision_id'; 
                    i.value = FacturasAPI.currentRemisionCode; 
                    f.appendChild(i); 
                    document.body.appendChild(f); 
                    f.submit(); 
                    document.body.removeChild(f);
                    Swal.close();
                }, 800);
            },

            finalizar: () => {
                Swal.fire({
                    title: '¿Cerrar Inventario?', text: "Una vez finalizado no se podrá editar.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Finalizar', cancelButtonText: 'Cancelar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const fd = new FormData(); fd.append('estado', 'FINALIZADO'); fd.append('remision_id', FacturasAPI.currentRemisionCode);
                        fetch('api/finalizar_remision.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => {
                            if(d.success) {
                                let form = document.createElement("form"); form.method = "POST"; form.action = "api/generar_sicar_final.php";
                                let inp = document.createElement("input"); inp.type = "hidden"; inp.name = "remision_id"; inp.value = FacturasAPI.currentRemisionCode;
                                form.appendChild(inp); document.body.appendChild(form); form.submit();
                                Swal.fire('¡Finalizado!', 'El archivo de Sicar se está descargando.', 'success').then(() => { 
                                    FacturasAPI.refrescarLista(); 
                                    FacturasAPI.cerrarDetalle(); 
                                    FacturasAPI.limpiarDetalle();
                                });
                            } else Swal.fire('Error', d.error, 'error');
                        });
                    }
                });
            },

            rechazar: (idItem, codigo) => {
                Swal.fire({
                    title: '¿Rechazar Producto?', text: "Este producto se enviará a reporte de devoluciones", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Sí, rechazar', cancelButtonText: 'Cancelar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const fd = new FormData(); fd.append('id_item', idItem);
                        fetch('api/api_devolver_item.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => {
                            if(d.success) { FacturasAPI.fetchDatos(); FacturasAPI.showToast('Producto enviado a devoluciones'); } else Swal.fire('Error', d.error, 'error');
                        });
                    }
                });
            },

            submitUploadForm: () => {
                let form = document.getElementById('formUploadModal'); 
                let btn = form.querySelector('button[onclick*="submitUploadForm"]'); 
                
                if (btn) btn.disabled = true;
                
                Swal.fire({ title: 'Analizando archivos...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                
                fetch('api/api_guardar_borrador.php', { method: 'POST', body: new FormData(form) }).then(r => r.json()).then(d => {
                    if(d.success) {
                        document.getElementById('modalSubir').close(); form.reset();
                        Swal.fire({ icon: 'success', title: '¡Carga Exitosa!', timer: 1500, showConfirmButton: false }).then(() => {
                            FacturasAPI.iniciarCarga(d.id_remision, d.proveedor);
                            FacturasAPI.refrescarLista();
                        });
                    } else Swal.fire('Error', d.error, 'error');
                }).finally(() => { if(btn) btn.disabled = false; });
            },

            refrescarLista: () => {
                const contenedor = document.getElementById('contenedorListaTareas');
                if(contenedor) fetch('api/api_listar_tareas.php').then(r => r.text()).then(html => { contenedor.innerHTML = html; });
            },

            toggleZoom: () => { FacturasAPI.zoomMode = !FacturasAPI.zoomMode; FacturasAPI.renderizarTodo(); }
        };
    })();
</script>
<datalist id="dlSicar"><?php try { $st = $pdo->query("SELECT clave_sicar FROM cat_productos LIMIT 2000"); while ($r = $st->fetch()) { echo "<option value='{$r['clave_sicar']}'>"; } } catch (Exception $e) {} ?></datalist>