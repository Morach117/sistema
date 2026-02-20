<?php
// views/modulo_facturas.php
session_start();
require_once '../config/db.php';
$rol = $_SESSION['rol'] ?? 'empleado';
?>
<script>window.userRol = '<?= $rol ?>';</script>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>

<style>
    .transition-all-elements, .transition-all-elements * { transition: all 0.2s ease-in-out; }
    #mainContainer { overflow-x: hidden; }
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    div:where(.swal2-container) button:where(.swal2-styled).swal2-confirm { background-color: #007bff !important; color: white !important; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    div:where(.swal2-container) button:where(.swal2-styled).swal2-cancel { background-color: #dc3545 !important; color: white !important; margin-right: 10px; }
</style>

<div class="toast toast-bottom toast-end z-[9999]" id="toastContainer"></div>

<div class="relative h-[calc(100vh-1rem)] bg-base-200 font-sans text-sm overflow-hidden flex transition-all-elements">
    
    <div id="panelLista" class="w-full md:w-72 2xl:w-80 flex-shrink-0 bg-white border-r border-base-300 flex flex-col h-full z-20 transition-transform duration-300 absolute md:relative">
        <div class="p-4 border-b border-base-300 bg-base-50 sticky top-0 z-10 h-16 flex justify-between items-center">
            <h2 class="font-bold text-lg text-gray-800 flex items-center gap-2">Tareas <span class="badge badge-primary badge-sm">Activas</span></h2>
            <div class="md:hidden text-xs text-gray-400 font-medium">Toca para abrir</div>
        </div>
        <div class="flex-grow overflow-y-auto p-2 space-y-2 custom-scrollbar bg-white" id="contenedorListaTareas">
            <?php
            try {
                $sql = "SELECT id, numero_remision, proveedor, fecha_carga, estado, (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id) as items FROM historial_remisiones hr WHERE estado IN ('PENDIENTE', 'ENVIADO', 'REVISION') ORDER BY fecha_carga DESC";
                $stmt = $pdo->query($sql);
                if ($stmt->rowCount() == 0) echo '<div class="flex flex-col items-center justify-center h-40 opacity-40 text-gray-500"><i class="bi bi-calendar-check text-4xl mb-2"></i><span>Al día</span></div>';
                while ($row = $stmt->fetch()):
                    $border = ($row['estado'] === 'REVISION') ? 'border-l-warning' : 'border-l-primary';
                    $badge = ($row['estado'] === 'REVISION') ? 'badge-warning' : 'badge-ghost';
                    $p = strtoupper($row['proveedor'] ?? '');
                    $iconProv = ($p === 'TONY') ? '🐯' : (($p === 'PAOLA' || $p === 'OPERADORA') ? '📄' : (($p === 'OPTIVOSA') ? '👓' : '📦'));
                    $provJs = !empty($row['proveedor']) ? $row['proveedor'] : 'MANUAL';
            ?>
                <div class="card bg-white border border-base-200 border-l-4 <?= $border ?> shadow-sm hover:shadow-md cursor-pointer transition-all rounded-md p-3 group active:bg-base-100" onclick="FacturasAPI.iniciarCarga(<?= $row['id'] ?>, '<?= $provJs ?>')">
                    <div class="flex justify-between items-center mb-1">
                        <h3 class="font-bold text-gray-800 text-base group-hover:text-primary transition-colors"><?= htmlspecialchars($row['numero_remision']) ?></h3>
                        <span class="badge badge-sm font-bold <?= $badge ?>"><?= $row['estado'] ?></span>
                    </div>
                    <div class="flex justify-between items-center text-xs text-gray-500">
                        <span><?= $iconProv ?> <?= date('d M • H:i', strtotime($row['fecha_carga'])) ?></span>
                        <span class="font-bold text-sm text-gray-700"><?= $row['items'] ?> items</span>
                    </div>
                </div>
            <?php endwhile; } catch (Exception $e) {} ?>
        </div>
    </div>

    <div id="panelDetalle" class="w-full flex flex-col h-full bg-base-200 absolute md:relative translate-x-full md:translate-x-0 transition-transform duration-300 z-30">
        <div class="navbar min-h-[3.5rem] bg-white shadow-sm px-4 sticky top-0 z-40 border-b border-base-300 flex-wrap gap-2 justify-between">
            <div class="flex items-center gap-2">
                <button class="btn btn-circle btn-ghost btn-sm md:hidden" onclick="FacturasAPI.cerrarDetalle()"><i class="bi bi-arrow-left text-xl"></i></button>
                <div class="bg-primary/10 p-1.5 rounded-lg text-primary hidden md:block"><i class="bi bi-box-seam-fill text-lg"></i></div>
                <div>
                    <h1 class="font-black text-lg text-gray-800 leading-none" id="headerTitulo">Recepción</h1>
                    <span class="text-[10px] text-gray-500 font-medium hidden sm:inline">Gestión de Inventario</span>
                </div>
            </div>
            <div id="toolbarGlobal" class="hidden md:flex items-center gap-2">
                <?php if ($rol === 'admin'): ?>
                <div class="flex items-center bg-base-50 rounded-lg border border-base-300 px-2 py-1 hover:shadow-sm">
                    <span class="text-[10px] font-bold uppercase text-gray-500 mr-1">Prov:</span>
                    <select id="sel_proveedor_global" class="select select-ghost select-xs w-32 font-bold text-gray-700 focus:bg-transparent focus:outline-none" onchange="FacturasAPI.cambiarProveedorManual(this.value)">
                        <option value="custom">🖐 Manual</option>
                        <option value="paola">📄 Paola/Oper.</option>
                        <option value="tony">🐯 Tony</option>
                        <option value="optivosa">👓 Optivosa</option>
                    </select>
                </div>
                <?php endif; ?>
                <button id="btnZoom" class="btn btn-sm btn-square btn-outline" onclick="FacturasAPI.toggleZoom()" title="Modo Lectura A+"><i class="bi bi-type-h1"></i></button>
            </div>
            <?php if ($rol === 'admin'): ?>
                <button class="btn btn-sm btn-primary shadow gap-2 hidden md:flex" onclick="document.getElementById('modalSubir').showModal()">
                    <i class="bi bi-plus-lg"></i> <span class="hidden sm:inline">Nueva</span>
                </button>
            <?php endif; ?>
        </div>
        <div class="flex-grow overflow-y-auto p-2 xl:p-4" id="mainContainer">
            <div id="zonaResultados" class="pb-24 w-full max-w-[1920px] mx-auto">
                <div class="flex flex-col items-center justify-center h-full text-gray-400 opacity-50 mt-20">
                    <i class="bi bi-basket2 text-8xl mb-4"></i>
                    <p class="text-xl font-medium">Selecciona una tarea de la lista</p>
                </div>
            </div>
        </div>
    </div>
</div>

<dialog id="modalSeleccionProveedor" class="modal modal-bottom sm:modal-middle"><div class="modal-box bg-white"><h3 class="font-bold text-lg text-gray-800 text-center mb-4">Selecciona Proveedor</h3><select id="selProvModal" class="select select-bordered select-primary w-full font-bold text-gray-700 text-lg"><option value="" disabled selected>-- Elige uno --</option><option value="paola">📄 Paola / Operadora</option><option value="tony">🐯 Tony</option><option value="optivosa">👓 Optivosa</option></select><div class="modal-action flex justify-between w-full"><button class="btn btn-ghost text-gray-500" onclick="FacturasAPI.cancelarCarga()">Cancelar</button><button class="btn btn-primary px-8" onclick="FacturasAPI.confirmarProveedor()">Confirmar</button></div></div></dialog>
<dialog id="modalSubir" class="modal"><div class="modal-box bg-white"><h3 class="font-bold text-lg">Cargar XML / CSV</h3><form id="formUploadModal" class="mt-4"><input type="file" name="archivo_factura[]" multiple class="file-input file-input-bordered file-input-primary w-full" accept=".csv,.xml" /><div class="modal-action"><form method="dialog"><button class="btn btn-ghost">Cancelar</button></form><button type="button" class="btn btn-primary" onclick="FacturasAPI.submitUploadForm()">Procesar</button></div></form></div></dialog>

<script>
    (() => {
        const fmtMoney = (n) => parseFloat(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
        const fmtInt = (n) => parseFloat(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });

        window.FacturasAPI = {
            currentId: null, currentRemisionCode: null, currentProveedor: null, dataCache: null, zoomMode: false,

            showToast: (msg, type = 'success') => {
                const container = document.getElementById('toastContainer');
                const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
                const icon = type === 'success' ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-x-circle-fill"></i>';
                const toast = document.createElement('div');
                toast.className = `alert ${alertClass} text-white shadow-lg flex items-center gap-2 p-3 rounded-lg text-sm font-bold min-w-[200px] animate-bounce-in`;
                toast.innerHTML = `${icon} <span>${msg}</span>`;
                container.appendChild(toast);
                setTimeout(() => { toast.remove(); }, 3000);
            },

            iniciarCarga: (id, proveedorBD) => {
                FacturasAPI.currentId = id;
                FacturasAPI.currentProveedor = null;
                document.getElementById('panelDetalle').classList.remove('translate-x-full');
                document.getElementById('zonaResultados').innerHTML = '<div class="flex justify-center p-20"><span class="loading loading-dots loading-lg text-primary"></span></div>';

                const selGlobal = document.getElementById('sel_proveedor_global');
                if(selGlobal) selGlobal.value = 'custom';

                let provStr = (proveedorBD || 'MANUAL').toUpperCase();
                let provFinal = 'custom';
                if(provStr.includes('PAOLA') || provStr.includes('OPERADORA')) provFinal = 'paola';
                else if(provStr.includes('TONY')) provFinal = 'tony';
                else if(provStr.includes('OPTIVOSA')) provFinal = 'optivosa';

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

                const styles = {
                    tiny: z ? 'text-sm font-bold text-gray-700' : 'text-[9px] 2xl:text-xs text-gray-400 font-bold',
                    big: z ? 'text-5xl font-black text-black' : 'text-2xl 2xl:text-3xl font-black text-gray-700',
                    inputH: z ? 'h-16' : 'h-10 2xl:h-12',
                    cardP: z ? 'p-6 bg-white' : 'p-2 2xl:p-3 bg-white',
                    gap: z ? 'gap-6' : 'gap-2 2xl:gap-4',
                    normal: z ? 'text-xl font-bold text-black' : 'text-xs 2xl:text-sm text-gray-800 font-bold'
                };

                let html = `<div id="contenedorInputs" class="w-full space-y-2 pb-32"><input type="hidden" name="remision_id" value="${FacturasAPI.currentRemisionCode}" class="data-input">`;
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
                        let checkDesc = (FacturasAPI.currentProveedor === 'paola') ? true : ((FacturasAPI.currentProveedor === 'tony') ? !tieneDescXML : false);
                        if(p.aplica_descuento_manual !== undefined && p.aplica_descuento_manual !== null) checkDesc = (p.aplica_descuento_manual == '1');

                        let esDevuelto = (p.revision_pendiente == 2);
                        let estiloCard = esDevuelto ? 'border-l-4 border-l-error bg-red-50' : 'border-base-200 bg-white';
                        let estiloInput = esDevuelto ? 'input-error text-error bg-white' : 'input-ghost text-primary bg-white';
                        
                        let adminHTML = '';
                        if(window.userRol === 'admin') {
                            let costoSis = parseFloat(p.costo_sistema_actual) || 0;
                            let ventaSis = parseFloat(p.precio_venta_sistema) || 0;
                            
                            // 1. Badge COSTO ANTERIOR (Compra)
                            let badgeCosto = costoSis > 0 
                                ? `<div class="mt-1 text-center"><span class="${styles.tiny} text-orange-600 font-bold bg-orange-50 px-2 rounded border border-orange-200">Ant: ${fmtMoney(costoSis)}</span></div>` 
                                : `<div class="badge badge-ghost badge-sm w-full mt-1 ${styles.tiny}">Nuevo</div>`;
                            
                            // 2. Badge PRECIO VENTA ACTUAL (S/P)
                            let displayVenta = ventaSis > 0 
                                ? `<div class="bg-yellow-100 text-yellow-800 text-[10px] font-black text-center rounded py-0.5 border border-yellow-200 mb-0.5 shadow-sm">VENTA: ${fmtMoney(ventaSis)}</div>` 
                                : `<div class="text-center text-gray-300 text-[9px]">Sin precio</div>`;

                            let btnRechazar = !esFinalizada && !esDevuelto ? `<button class="btn btn-xs btn-outline btn-error w-full flex items-center justify-center gap-1" onclick="FacturasAPI.rechazar(${p.id}, '${p.cod_prov}')"><i class="bi bi-x-circle-fill"></i> Rechazar</button>` : (esDevuelto ? `<div class="badge badge-error w-full py-2 text-white font-bold text-[10px]">REPORTADO</div>` : '');

                            adminHTML = `
                            <div class="w-full ${z ? '' : 'xl:w-72 2xl:w-80'} flex flex-col gap-1 border-l pl-3 border-base-200 justify-center">
                                <div class="flex items-center gap-2 pb-1 border-b border-base-100">
                                    <label class="cursor-pointer flex items-center gap-1 px-2 py-1 rounded border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors h-6"><input type="checkbox" id="chk_desc_${i}" data-idx="${i}" data-id-item="${p.id}" class="checkbox checkbox-xs checkbox-secondary rounded-[3px] border-purple-400 data-input" value="1" ${checkDesc ? 'checked' : ''} onchange="FacturasAPI.calculoEnVivo(${i}, true)"><span class="font-bold text-[10px] text-purple-700">-5%</span></label>
                                    <div class="flex-grow">${btnRechazar}</div>
                                </div>
                                <div class="flex gap-2">
                                    <div class="bg-base-100 p-1 rounded border border-base-300 flex flex-col items-center justify-center w-1/2">
                                        <span class="${styles.tiny} uppercase tracking-wider text-gray-400">COSTO</span>
                                        <div class="flex items-center justify-center gap-0.5"><span class="text-gray-400 font-bold text-xs">$</span><input type="number" step="0.01" id="inp_costo_manual_${i}" data-idx="${i}" data-id-item="${p.id}" class="input input-xs input-ghost ${styles.big} font-black text-gray-700 text-center w-full p-0 h-auto leading-none focus:bg-white" value="0.00" onchange="FacturasAPI.guardarCampo(this, 'costo_unitario')"></div>
                                        ${badgeCosto}
                                    </div>
                                    <div class="w-1/2 flex flex-col gap-1">
                                         ${displayVenta}
                                         <div class="grid grid-cols-2 gap-1 h-full">
                                            <div class="bg-blue-50 rounded border border-blue-100 flex flex-col items-center justify-center py-0.5"><div class="text-[8px] font-bold text-blue-500">20%</div><div id="lbl_20_${i}" class="font-bold text-blue-700 text-xs">$0</div></div>
                                            <div class="bg-green-50 rounded border border-green-100 flex flex-col items-center justify-center py-0.5"><div class="text-[8px] font-bold text-green-500">30%</div><div id="lbl_30_${i}" class="font-bold text-green-700 text-xs">$0</div></div>
                                         </div>
                                    </div>
                                </div>
                            </div>`;
                        } else { adminHTML = `<div class="w-full xl:w-auto flex flex-col gap-2 items-end justify-center">${esDevuelto ? '<div class="badge badge-error text-white font-bold w-full py-3 text-sm">REPORTADO</div>' : ''}</div>`; }

                        html += `<div class="card shadow-sm border ${estiloCard} hover:shadow-md transition-all duration-200 row-container" data-idx="${i}">
                            <div class="card-body ${styles.cardP} flex ${z ? 'flex-col' : 'flex-col xl:flex-row'} ${styles.gap} items-stretch xl:items-center">
                                <input type="hidden" id="hidden_costo_${i}" value="${p.costo}">
                                <div class="flex flex-row xl:flex-col items-center gap-2 border-b xl:border-b-0 xl:border-r border-base-200 pb-2 xl:pb-0 xl:pr-3 w-full ${z ? '' : 'xl:w-auto'} justify-between xl:justify-center">
                                    <div class="text-center"><label class="${styles.tiny} uppercase font-bold text-gray-400 mb-0.5">FACTURA</label><input type="number" id="inp_cant_${i}" data-id-item="${p.id}" class="input input-lg input-ghost p-0 ${styles.big} font-black text-center ${z ? 'w-full' : 'w-16 2xl:w-24'} text-gray-700 data-input ${styles.inputH}" value="${cantFactura}" ${readOnlyAttr} onchange="FacturasAPI.calculoEnVivo(${i}, true); FacturasAPI.guardarCampo(this, 'cantidad_real')"></div>
                                    <div class="flex flex-col items-end xl:items-center">
                                        <div class="flex items-center gap-1 mb-1"><span class="${styles.tiny} font-bold text-gray-500">CAJA</span> <input type="checkbox" id="chk_paq_${i}" data-idx="${i}" data-id-item="${p.id}" class="toggle toggle-xs toggle-primary" ${esPaquete ? 'checked' : ''} ${readOnlyAttr} onchange="FacturasAPI.calculoEnVivo(${i}, true)"/></div>
                                        <div class="flex items-center gap-1 ${esPaquete ? '' : 'hidden'}" id="wrap_pz_${i}"><input type="number" id="inp_pz_${i}" data-id-item="${p.id}" class="input input-xs input-bordered input-primary w-12 text-center font-bold px-1" value="${piezas}" ${readOnlyAttr} onchange="FacturasAPI.calculoEnVivo(${i}, true)"><span class="${styles.tiny} text-gray-400">pz</span></div>
                                        <span id="lbl_total_${i}" class="${styles.tiny} font-bold mt-1 text-primary"></span>
                                    </div>
                                </div>
                                <div class="flex-grow w-full ${z ? '' : 'xl:w-auto xl:flex-1'} text-center xl:text-left min-w-0">
                                    <div class="font-bold ${styles.normal} leading-tight mb-1 truncate break-words whitespace-normal">${p.desc}</div>
                                    <div class="flex flex-wrap justify-center xl:justify-start gap-2 items-center">
                                        <div class="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5"><span class="font-mono text-gray-600 font-bold ${styles.tiny} cursor-pointer" onclick="navigator.clipboard.writeText('${p.cod_prov}')">${p.cod_prov}</span><button class="btn btn-xs btn-circle btn-ghost text-gray-500" onclick="FacturasAPI.verCodigoBarras('${p.cod_prov}', '${p.desc.replace(/'/g, "")}')"><i class="bi bi-upc-scan text-xs"></i></button></div>
                                        <div class="join shadow-sm ${z ? 'h-10' : 'h-6 2xl:h-8'} hidden md:flex"><span class="join-item btn btn-xs btn-neutral no-animation pointer-events-none px-2 ${styles.tiny} flex items-center">SICAR</span><input type="text" class="join-item input input-xs input-bordered w-24 2xl:w-32 font-mono text-center data-input ${z ? 'h-10 text-lg' : 'h-6 2xl:h-8 text-[10px]'} font-bold" data-id-item="${p.id}" value="${claveFinal}" list="dlSicar" placeholder="---" ${readOnlyAttr} onchange="FacturasAPI.guardarCampo(this, 'clave_final')"></div>
                                    </div>
                                    <input type="hidden" name="items[${i}][cod_prov]" value="${p.cod_prov}" class="data-input">
                                </div>
                                <div class="flex flex-col items-center bg-base-100 p-2 rounded-lg border-2 border-base-200 ${z ? 'w-full' : 'w-24 2xl:w-28'} shrink-0">
                                    <span id="lbl_instr_${i}" class="${styles.tiny} font-bold text-gray-400 uppercase tracking-widest mb-1 text-center">FÍSICO</span>
                                    <input type="number" step="any" class="input input-md w-full text-center font-black ${styles.big} focus:outline-none ${styles.inputH} data-input ${estiloInput} p-0" data-id-item="${p.id}" value="${fisico}" ${readOnlyAttr} placeholder="0" onchange="FacturasAPI.guardarCampo(this, 'existencia_lapiz')">
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
                    html += `<div class="fixed bottom-4 right-4 z-50"><button class="btn btn-neutral btn-md shadow-xl rounded-full px-8 gap-2 no-animation cursor-default"><i class="bi bi-check2-all"></i> Finalizado</button></div>`;
                } else {
                    if (window.userRol !== 'admin') {
                        html += `<div class="fixed bottom-4 right-4 z-50"><button onclick="FacturasAPI.guardarAvance()" class="btn btn-primary btn-md shadow-xl rounded-full px-8 gap-2"><i class="bi bi-save"></i> Guardar Avance</button></div>`;
                    } else {
                        html += `<div class="fixed bottom-4 right-4 z-50 flex gap-2"><button onclick="FacturasAPI.guardarYValidar()" class="btn btn-info text-white shadow-xl rounded-full px-6 gap-2"><i class="bi bi-file-earmark-spreadsheet"></i> Validar Excel</button><button onclick="FacturasAPI.finalizar()" class="btn btn-success text-white shadow-xl rounded-full px-8 gap-2"><i class="bi bi-check-lg"></i> Finalizar</button></div>`;
                    }
                }
                document.getElementById('zonaResultados').innerHTML = html;
                filasParaCalcular.forEach(idx => FacturasAPI.calculoEnVivo(idx, false));
            },

            guardarAvance: () => {
                FacturasAPI.showToast('Avance guardado correctamente');
                FacturasAPI.refrescarLista();
            },

            calculoEnVivo: (idx, guardar = false) => {
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
                    lblTotal.innerHTML = `<span class="text-secondary font-bold text-xs">= ${fmtInt(cajas)} CAJAS</span>`;
                } else {
                    wrapperPz.classList.add('hidden');
                    lblTotal.innerText = "Piezas";
                }

                if(chkDesc && chkDesc.checked) costoFinal *= 0.95;
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
                // 1. Forzamos el guardado de cualquier input que el usuario esté escribiendo actualmente
                if (document.activeElement) {
                    document.activeElement.blur(); 
                }
                
                // 2. Mostramos carga visual de SweetAlert
                Swal.fire({ 
                    title: 'Calculando Totales...', 
                    text: 'Sumando factura + físico y agrupando códigos',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); } 
                });
                
                // 3. Esperamos un momento breve para que los fetch de autoguardado terminen
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
                    title: '¿Finalizar?', text: "Se cerrará el inventario.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const fd = new FormData(); fd.append('estado', 'FINALIZADO'); fd.append('remision_id', FacturasAPI.currentRemisionCode);
                        fetch('api/finalizar_remision.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => {
                            if(d.success) {
                                let form = document.createElement("form"); form.method = "POST"; form.action = "api/generar_sicar_final.php";
                                let inp = document.createElement("input"); inp.type = "hidden"; inp.name = "remision_id"; inp.value = FacturasAPI.currentRemisionCode;
                                form.appendChild(inp); document.body.appendChild(form); form.submit();
                                Swal.fire('¡Listo!', 'Finalizado correctamente.', 'success').then(() => { FacturasAPI.refrescarLista(); FacturasAPI.cerrarDetalle(); });
                            } else Swal.fire('Error', d.error, 'error');
                        });
                    }
                });
            },

            rechazar: (idItem, codigo) => {
                Swal.fire({
                    title: '¿Rechazar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Sí, rechazar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const fd = new FormData(); fd.append('id_item', idItem);
                        fetch('api/api_devolver_item.php', { method: 'POST', body: fd }).then(r => r.json()).then(d => {
                            if(d.success) { FacturasAPI.fetchDatos(); FacturasAPI.showToast('Producto rechazado'); } else Swal.fire('Error', d.error, 'error');
                        });
                    }
                });
            },

            submitUploadForm: () => {
                let form = document.getElementById('formUploadModal'); let btn = form.querySelector('button.btn-primary'); btn.disabled = true;
                Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                fetch('api/api_guardar_borrador.php', { method: 'POST', body: new FormData(form) }).then(r => r.json()).then(d => {
                    if(d.success) {
                        document.getElementById('modalSubir').close(); form.reset();
                        Swal.fire({ icon: 'success', title: '¡Carga Exitosa!', timer: 1500, showConfirmButton: false }).then(() => {
                            FacturasAPI.iniciarCarga(d.id_remision, d.proveedor);
                            FacturasAPI.refrescarLista();
                        });
                    } else Swal.fire('Error', d.error, 'error');
                }).finally(() => btn.disabled = false);
            },

            refrescarLista: () => {
                const contenedor = document.getElementById('contenedorListaTareas');
                if(contenedor) fetch('api/api_listar_tareas.php').then(r => r.text()).then(html => { contenedor.innerHTML = html; });
            },

            toggleZoom: () => { FacturasAPI.zoomMode = !FacturasAPI.zoomMode; FacturasAPI.renderizarTodo(); }
        };
    })();
</script>
<datalist id="dlSicar"><?php try { $st = $pdo->query("SELECT clave_sicar FROM cat_productos LIMIT 2000"); while ($r = $st->fetch()) { echo "<option value='{$r['clave_sicar']}'>"; } } catch (E $e) {} ?></datalist>