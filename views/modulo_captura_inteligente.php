<?php
// ZONA HORARIA CORREGIDA
date_default_timezone_set('America/Mexico_City');

if (session_status() === PHP_SESSION_NONE) { session_start(); }
$nombre_usuario = $_SESSION['nombre'] ?? 'Operador';
?>

<style>
    /* Estilos Modernos 2026 */
    
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .table-fixed-head thead { position: sticky; top: 0; z-index: 10; }
    
    /* Scrollbar minimalista */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    
    /* Efectos Glassmorphism y sombras suaves */
    .glass-panel { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.5); }
    .shadow-soft { box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); }
    
    /* Clases Modo Uso */
    .btn-uso { background: linear-gradient(135deg, #f97316, #ea580c) !important; color: white !important; box-shadow: 0 8px 20px -6px rgba(234, 88, 12, 0.5) !important;}
    .input-uso { border-color: #fdba74 !important; color: #c2410c !important; background-color: #fff7ed !important; }
    .input-uso:focus { box-shadow: 0 0 0 4px rgba(253, 186, 116, 0.3) !important; }
</style>

<div class="h-screen flex flex-col select-none bg-slate-50 text-slate-800 selection:bg-indigo-100 overflow-hidden">
    
    <div class="p-4 shrink-0 z-20">
        <header class="glass-panel rounded-2xl px-6 py-4 flex justify-between items-center shadow-sm">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                    <i class="bi bi-box-seam-fill text-white text-xl"></i>
                </div>
                <div>
                    <h1 class="text-xl font-extrabold bg-gradient-to-r from-indigo-900 to-slate-700 bg-clip-text text-transparent tracking-tight leading-none">CAPTURA DE INVENTARIO</h1>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SISTEMA GESTIÓN 2.0</span>
                </div>
            </div>
            <div class="flex items-center gap-5">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs"><?= substr($nombre_usuario, 0, 1) ?></div>
                    <span class="text-sm font-bold text-slate-600 uppercase hidden md:block"><?= htmlspecialchars($nombre_usuario) ?></span>
                </div>
                <button onclick="CapturaAPI.cargarHistorial()" class="bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-500 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95 flex items-center gap-2">
                    <i class="bi bi-arrow-clockwise text-sm"></i> ACTUALIZAR
                </button>
            </div>
        </header>
    </div>

    <div class="flex-1 overflow-hidden px-4 pb-4 max-w-screen-2xl mx-auto w-full flex flex-col gap-4">

        <div class="glass-panel rounded-3xl p-6 shadow-soft shrink-0">
            
            <div class="flex flex-col md:flex-row gap-6 mb-6">
                <div class="w-full md:w-1/3">
                    <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 ml-1">CÓDIGO DE BARRAS PRINCIPAL</label>
                    <input type="text" id="inpCodigo" 
                        onkeydown="if(event.key==='Enter') { event.preventDefault(); CapturaAPI.verificar(this.value); }"
                        onchange="CapturaAPI.verificar(this.value)"
                        class="w-full h-20 px-6 text-4xl font-mono font-black text-slate-800 bg-white border-2 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none rounded-2xl transition-all placeholder:text-slate-300 shadow-inner" 
                        placeholder="Escanear..." autofocus autocomplete="off">
                </div>

                <div class="flex-1 bg-gradient-to-br from-indigo-50 to-blue-50/50 border border-indigo-100 rounded-2xl px-6 flex flex-col justify-center relative overflow-hidden transition-all shadow-sm" id="cardNombreProducto">
                    <span class="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest mb-1" id="lblEstado">ESPERANDO LECTURA...</span>
                    <div class="text-3xl font-black text-slate-800 truncate leading-tight" id="lblNombreProducto">---</div>
                    
                    <div id="zonaVincular" class="hidden absolute inset-0 bg-amber-50/95 backdrop-blur-sm flex items-center justify-between px-6 z-10 transition-all border border-amber-200 rounded-2xl">
                        <div class="flex-1 flex items-center gap-4">
                            <div class="bg-amber-100 p-2 rounded-lg text-amber-600"><i class="bi bi-link-45deg text-xl"></i></div>
                            <div class="flex-1">
                                <span class="text-amber-800 font-extrabold text-xs block mb-1 tracking-wide">VINCULAR PIEZA SUELTA (OPCIONAL)</span>
                                <input type="text" id="inpVinculo" 
                                    onkeydown="if(event.key==='Enter') { event.preventDefault(); CapturaAPI.buscarVinculo(this.value); }"
                                    class="w-full h-10 px-4 font-mono font-bold border-2 border-amber-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 bg-white rounded-xl outline-none transition-all"
                                    placeholder="Escanea la pieza aquí...">
                            </div>
                        </div>
                        <button onclick="CapturaAPI.omitirVinculo()" class="ml-4 text-xs font-bold text-amber-600 hover:text-amber-800 hover:bg-amber-200 px-3 py-2 rounded-lg transition-colors">
                            Omitir ✖
                        </button>
                    </div>
                </div>
            </div>

            <div id="zonaInputs" class="hidden">
                <div class="grid grid-cols-12 gap-5 items-end bg-white/60 p-5 rounded-2xl border border-slate-200 transition-colors" id="cardInputs">
                    
                    <div class="col-span-2">
                        <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 text-center">SUELTOS (PZ)</label>
                        <input type="number" id="inpExistencia" oninput="CapturaAPI.calcular()"
                            class="w-full h-16 text-center text-3xl font-bold text-slate-600 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-sm bg-white" value="0">
                    </div>

                    <div class="col-span-3">
                        <label class="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider mb-2 text-center" id="lblBultos">BULTOS / CAJAS</label>
                        <input type="number" id="inpBultos" oninput="CapturaAPI.calcular()"
                            class="w-full h-20 text-center text-5xl font-black text-indigo-700 border-2 border-indigo-200 bg-white rounded-2xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 outline-none shadow-md transition-all" value="0">
                    </div>

                    <div class="col-span-2 relative">
                        <div class="absolute -left-3 top-1/2 -translate-y-1/2 text-slate-300 font-black text-2xl">×</div>
                        <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 text-center">PZ X BULTO</label>
                        <input type="number" id="inpFactor" oninput="CapturaAPI.calcular()"
                            class="w-full h-16 text-center text-2xl font-bold text-slate-600 border border-slate-200 border-dashed rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none bg-white transition-all" value="1">
                    </div>

                    <div class="col-span-5 flex flex-col justify-end h-20 gap-3 pl-2">
                        <div class="flex justify-end items-center pr-2">
                            <label class="flex items-center cursor-pointer select-none group">
                                <span class="text-[10px] font-extrabold text-slate-400 group-hover:text-orange-500 tracking-wider mr-3 transition-colors">¿ES PARA USO?</span>
                                <div class="relative">
                                    <input type="checkbox" id="chkConsumo" class="peer sr-only" onchange="CapturaAPI.cambiarModoVisual(false)">
                                    <div class="block bg-slate-200 w-10 h-6 rounded-full peer-checked:bg-orange-500 transition-colors"></div>
                                    <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                                </div>
                            </label>
                        </div>

                        <button id="btnConfirmar" onclick="CapturaAPI.guardar()" disabled
                            class="w-full h-16 bg-gradient-to-r from-slate-200 to-slate-300 text-slate-400 font-black text-xl tracking-wide rounded-xl transition-all duration-300 flex justify-between items-center px-6 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span id="txtBtnGuardar">CONFIRMAR</span>
                            <div class="text-right leading-none bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                                <span class="block text-[9px] font-bold tracking-widest uppercase opacity-80 mb-0.5">TOTAL PZ</span>
                                <span id="lblBtnTotal" class="font-mono text-2xl">0</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="glass-panel rounded-3xl border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1 shadow-soft">
            <div class="bg-white/50 backdrop-blur-md px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
                <span class="font-extrabold text-slate-700 text-xs uppercase tracking-widest flex items-center gap-2">
                    <i class="bi bi-clock-history text-indigo-500 text-base"></i> HISTORIAL DE HOY
                </span>
                <span class="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-xs font-mono font-bold border border-indigo-100" id="lblConteoHistorial">0 regs</span>
            </div>
            
            <div class="overflow-y-auto flex-1 p-2">
                <table class="w-full text-left border-collapse table-fixed-head">
                    <thead class="bg-slate-100/80 backdrop-blur-sm text-slate-500 text-[10px] uppercase font-extrabold tracking-wider sticky top-0 z-10 rounded-t-xl">
                        <tr>
                            <th class="p-4 border-b border-slate-200 w-36 rounded-tl-xl">CÓDIGO</th>
                            <th class="p-4 border-b border-slate-200">DESCRIPCIÓN</th>
                            <th class="p-4 border-b border-slate-200 text-center w-28">USO</th>
                            <th class="p-4 border-b border-slate-200 text-center w-24">CANT.</th>
                            <th class="p-4 border-b border-slate-200 text-right pr-8 w-28">TOTAL</th>
                            <th class="p-4 border-b border-slate-200 w-14 rounded-tr-xl"></th>
                        </tr>
                    </thead>
                    <tbody id="tablaHistorialBody" class="text-sm text-slate-700 font-medium divide-y divide-slate-100">
                        <tr><td colspan="6" class="text-center py-12 text-slate-400 font-medium">Cargando datos...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

    </div>
</div>

<script>
window.CapturaAPI = {
    baseApi: 'api/', 
    estado: 'ESPERA', 
    datos: {},

    init: () => {
        CapturaAPI.cargarHistorial();
        const inp = document.getElementById('inpCodigo');
        if(inp) setTimeout(() => inp.focus(), 100);

        ['inpExistencia', 'inpBultos', 'inpFactor'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.addEventListener('focus', function() { this.select(); });
                el.addEventListener('keydown', e => {
                    if(e.key === 'Enter') {
                        e.preventDefault();
                        if(id === 'inpFactor') document.getElementById('inpBultos').focus();
                        else {
                            CapturaAPI.calcular(); 
                            setTimeout(() => { 
                                if(!document.getElementById('btnConfirmar').disabled) CapturaAPI.guardar(); 
                            }, 50);
                        }
                    }
                });
            }
        });
        document.addEventListener('keydown', e => { if(e.key === 'Escape') CapturaAPI.resetear(); });
    },

    cambiarModoVisual: (autoFocus = true) => {
        const isConsumo = document.getElementById('chkConsumo').checked;
        const btn = document.getElementById('btnConfirmar');
        const txtBtn = document.getElementById('txtBtnGuardar');
        
        const inpBultos = document.getElementById('inpBultos');
        const inpExistencia = document.getElementById('inpExistencia');
        const inpFactor = document.getElementById('inpFactor');
        const zonaVincular = document.getElementById('zonaVincular');

        if (isConsumo) {
            if (!zonaVincular.classList.contains('hidden')) {
                zonaVincular.classList.add('hidden'); 
                inpFactor.value = 1; 
                document.getElementById('lblNombreProducto').innerHTML = `<span class="text-orange-500">Producto Manual (Uso)</span>`;
            }
            if(inpFactor.value === '' || inpFactor.value == 0) inpFactor.value = 1;
            inpBultos.value = 0; inpBultos.disabled = true; inpBultos.classList.add('opacity-50');
            if(parseFloat(inpExistencia.value) === 0) inpExistencia.value = 1;
            
            btn.classList.add('btn-uso');
            btn.classList.remove('from-indigo-600', 'to-blue-600');
            inpExistencia.classList.add('input-uso');
            txtBtn.innerText = "REGISTRAR USO";
            if(!autoFocus) inpExistencia.focus();

        } else {
            if (CapturaAPI.datos.registrar_nuevo) {
                zonaVincular.classList.remove('hidden');
                
                // RESTAURAR NOMBRE REAL SI ES DE BD
                if (CapturaAPI.datos.nombre_caja && CapturaAPI.datos.nombre_caja !== "PRODUCTO NUEVO (SIN REGISTRO)") {
                    document.getElementById('lblNombreProducto').innerHTML = `<span class="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-md mr-2 align-middle">SICAR</span><span>${CapturaAPI.datos.nombre_caja}</span>`;
                } else {
                    document.getElementById('lblNombreProducto').innerText = "---";
                }
                
                if(!autoFocus) document.getElementById('inpVinculo').focus();
            } else {
                if(!autoFocus) inpBultos.focus();
            }

            inpBultos.disabled = false; inpBultos.classList.remove('opacity-50');
            btn.classList.remove('btn-uso');
            inpExistencia.classList.remove('input-uso');
            txtBtn.innerText = "CONFIRMAR";
        }
        CapturaAPI.calcular();
    },

    verificar: (codigo) => {
        codigo = codigo.trim(); if(!codigo) return;
        if (CapturaAPI.estado === 'BUSCANDO') return;
        CapturaAPI.estado = 'BUSCANDO';

        const inp = document.getElementById('inpCodigo');
        inp.disabled = true; 
        document.getElementById('lblEstado').innerHTML = '<i class="bi bi-arrow-repeat animate-spin inline-block mr-1"></i> BUSCANDO...';
        
        const fd = new FormData(); fd.append('codigo', codigo);
        fetch(CapturaAPI.baseApi + 'api_captura_verificar.php', {method:'POST', body:fd})
            .then(r => r.json())
            .then(d => {
                const nombre = d.descripcion_caja || "PRODUCTO DESCONOCIDO";
                CapturaAPI.prepararUI(d, codigo, nombre);
            })
            .catch(() => CapturaAPI.resetear());
    },

    // NUEVA FUNCIÓN: Para ocultar la vinculación si el producto nuevo es individual
    omitirVinculo: () => {
        document.getElementById('zonaVincular').classList.add('hidden');
        CapturaAPI.datos.nombre_suelto = "Pieza Individual";
        const inpF = document.getElementById('inpFactor');
        inpF.value = 1;
        inpF.focus(); inpF.select();
        CapturaAPI.calcular();
    },

    buscarVinculo: (codigo) => {
        codigo = codigo.trim(); if(!codigo) return;
        const v = document.getElementById('inpVinculo');
        if(v.disabled) return;
        v.disabled = true;
        
        const fd = new FormData(); fd.append('codigo', codigo);
        fetch(CapturaAPI.baseApi + 'api_buscar_producto.php', {method:'POST', body:fd})
            .then(r=>r.json()).then(d => {
                v.disabled = false;
                if(d.success) {
                    document.getElementById('zonaVincular').classList.add('hidden');
                    
                    let nombreCaja = CapturaAPI.datos.nombre_caja;
                    if (!nombreCaja || nombreCaja === 'PRODUCTO NUEVO (SIN REGISTRO)') {
                        nombreCaja = 'Caja de Proveedor';
                    }
                    let nombrePieza = d.data.descripcion; 
                    
                    document.getElementById('lblNombreProducto').innerHTML = `
                        <div class="flex flex-col mt-1">
                            <div class="text-xs font-bold text-slate-500 truncate"><span class="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] mr-1 uppercase">CAJA</span> ${nombreCaja}</div>
                            <div class="text-2xl font-black text-slate-800 truncate leading-tight mt-0.5"><span class="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] mr-1 uppercase align-middle">CONTIENE</span> ${nombrePieza}</div>
                        </div>`;
                    
                    CapturaAPI.datos.clave_sicar_final = d.data.clave_sicar;
                    CapturaAPI.datos.nombre_suelto = `CAJA: ${nombreCaja} ➔ PIEZA: ${nombrePieza}`; 
                    
                    const inpF = document.getElementById('inpFactor');
                    inpF.focus(); inpF.select();
                    CapturaAPI.calcular();
                } else {
                    v.style.borderColor = '#ef4444'; setTimeout(()=>v.style.borderColor='', 500); v.value='';
                    v.focus();
                }
            });
    },

    prepararUI: (d, codigo, nombre) => {
        document.getElementById('zonaInputs').classList.remove('hidden');
        CapturaAPI.datos = { ...d, codigo: codigo, nombre_caja: nombre, registrar_nuevo: false };

        const vinculoDiv = document.getElementById('zonaVincular');
        const inpFactor = document.getElementById('inpFactor');
        const chkConsumo = document.getElementById('chkConsumo');

        if (d.modo_preferido === 'CONSUMO') { chkConsumo.checked = true; } 
        else { chkConsumo.checked = false; }

        if (d.tipo === 'CONOCIDO_MEMORIA') {
            vinculoDiv.classList.add('hidden');
            
            if (d.factor > 1) {
                if (nombre.includes('➔')) {
                    let partes = nombre.split('➔');
                    let nomC = partes[0].replace('CAJA:', '').trim();
                    let nomP = partes[1].replace('PIEZA:', '').trim();
                    
                    document.getElementById('lblNombreProducto').innerHTML = `
                        <div class="flex flex-col mt-1">
                            <div class="text-xs font-bold text-slate-500 truncate"><span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] mr-1 uppercase">CAJA</span> ${nomC}</div>
                            <div class="text-2xl font-black text-slate-800 truncate leading-tight mt-0.5"><span class="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] mr-1 uppercase align-middle">CONTIENE</span> ${nomP}</div>
                        </div>`;
                } else {
                    document.getElementById('lblNombreProducto').innerHTML = `<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-md mr-2 align-middle border border-emerald-200 shadow-sm">✓ CONOCIDO</span><span>${nombre}</span>`;
                }
                document.getElementById('lblEstado').innerText = "CAJA IDENTIFICADA";
            } else {
                document.getElementById('lblNombreProducto').innerText = nombre;
                document.getElementById('lblEstado').innerText = "PIEZA IDENTIFICADA";
            }

            CapturaAPI.datos.nombre_suelto = nombre; 
            inpFactor.value = d.factor; 
            inpFactor.disabled = true; 
            inpFactor.classList.add('bg-slate-100', 'text-slate-400');
            
            CapturaAPI.cambiarModoVisual(true);
            
            setTimeout(() => {
                if (chkConsumo.checked) { document.getElementById('inpExistencia').focus(); document.getElementById('inpExistencia').select(); }
                else if (d.factor > 1) { document.getElementById('inpBultos').focus(); document.getElementById('inpBultos').select(); }
                else { document.getElementById('inpExistencia').focus(); document.getElementById('inpExistencia').select(); }
            }, 50);

        } else {
            document.getElementById('lblEstado').innerText = "VINCULAR AL SISTEMA";
            CapturaAPI.datos.registrar_nuevo = true;
            CapturaAPI.datos.clave_sicar_final = d.clave_sicar; 
            
            if (d.tipo === 'NUEVO_CATALOGO') {
                document.getElementById('lblNombreProducto').innerHTML = `<span class="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-md mr-2 align-middle border border-indigo-200 shadow-sm">SICAR</span><span class="text-slate-700">${nombre}</span>`;
            } else {
                document.getElementById('lblNombreProducto').innerText = "---";
            }
            
            CapturaAPI.cambiarModoVisual(true);
            
            if(!chkConsumo.checked) {
                vinculoDiv.classList.remove('hidden');
                document.getElementById('inpVinculo').value = '';
                setTimeout(() => document.getElementById('inpVinculo').focus(), 50);
            } else {
                inpFactor.value = 1;
                setTimeout(() => { document.getElementById('inpExistencia').focus(); document.getElementById('inpExistencia').select(); }, 50);
            }
            
            inpFactor.disabled = false; 
            inpFactor.classList.remove('bg-slate-100', 'text-slate-400');
        }
        CapturaAPI.calcular();
    },

    calcular: () => {
        const b = parseFloat(document.getElementById('inpBultos').value) || 0;
        const f = parseFloat(document.getElementById('inpFactor').value) || 0;
        const e = parseFloat(document.getElementById('inpExistencia').value) || 0;
        const total = (b * f) + e;
        
        const btn = document.getElementById('btnConfirmar');
        const isConsumo = document.getElementById('chkConsumo').checked;
        document.getElementById('lblBtnTotal').innerText = total.toLocaleString();

        if(total > 0) {
            btn.disabled = false;
            if(isConsumo) {
                btn.className = "w-full h-16 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black text-xl tracking-wide rounded-xl shadow-lg shadow-orange-500/30 transition-all duration-300 flex justify-between items-center px-6 active:scale-[0.98]";
                document.getElementById('txtBtnGuardar').innerText = "REGISTRAR USO";
            } else {
                btn.className = "w-full h-16 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-black text-xl tracking-wide rounded-xl shadow-lg shadow-indigo-500/30 transition-all duration-300 flex justify-between items-center px-6 active:scale-[0.98]";
                document.getElementById('txtBtnGuardar').innerText = "CONFIRMAR";
            }
        } else {
            btn.disabled = true;
            btn.className = "w-full h-16 bg-slate-200 text-slate-400 font-black text-xl tracking-wide rounded-xl transition-all duration-300 flex justify-between items-center px-6 cursor-not-allowed";
        }
    },

    guardar: () => {
        const btn = document.getElementById('btnConfirmar');
        if(btn.disabled) return; 
        btn.disabled = true;
        
        const fd = new FormData();
        fd.append('codigo', CapturaAPI.datos.codigo);
        fd.append('existencia', document.getElementById('inpExistencia').value);
        fd.append('bultos', document.getElementById('inpBultos').value);
        fd.append('factor', document.getElementById('inpFactor').value);
        
        const claveParaGuardar = CapturaAPI.datos.clave_sicar_final || CapturaAPI.datos.clave_sicar || '';
        fd.append('clave_sicar', claveParaGuardar);
        
        let nombreFinal = CapturaAPI.datos.nombre_suelto || CapturaAPI.datos.nombre_caja;
        if(!nombreFinal || nombreFinal === '---') nombreFinal = "Producto Manual";
        fd.append('descripcion_actual', nombreFinal);
        
        const isConsumo = document.getElementById('chkConsumo').checked;
        fd.append('tipo_uso', isConsumo ? 'CONSUMO' : 'VENTA');
        if(CapturaAPI.datos.registrar_nuevo) fd.append('registrar_nuevo', 'true');

        fetch(CapturaAPI.baseApi + 'api_captura_guardar.php', {method:'POST', body:fd})
            .then(r=>r.json()).then(d => {
                if(d.success) {
                    if(typeof Swal !== 'undefined') {
                        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: isConsumo ? 'Uso Registrado' : 'Guardado', showConfirmButton: false, timer: 1500 });
                    }
                    CapturaAPI.resetear(); 
                    CapturaAPI.cargarHistorial();
                } else {
                    btn.disabled = false; 
                    alert('Error: ' + d.error);
                }
            })
            .catch(() => { btn.disabled = false; });
    },

    eliminar: (id) => {
        if(confirm('¿Descartar este registro?')) {
            const fd = new FormData(); fd.append('id', id);
            fetch(CapturaAPI.baseApi + 'api_captura_eliminar.php', {method:'POST', body:fd})
                .then(() => CapturaAPI.cargarHistorial());
        }
    },

    resetear: () => {
        // CORRECCIÓN CLAVE: ¡Limpiamos la memoria!
        CapturaAPI.datos = {}; 

        const inp = document.getElementById('inpCodigo');
        inp.disabled=false; inp.value='';
        document.getElementById('zonaInputs').classList.add('hidden');
        document.getElementById('inpExistencia').value='0'; 
        document.getElementById('inpBultos').value='0';
        document.getElementById('inpFactor').value='1';
        document.getElementById('lblBtnTotal').innerText = '0';
        
        document.getElementById('zonaVincular').classList.add('hidden');
        document.getElementById('lblNombreProducto').innerText = '---';
        document.getElementById('lblEstado').innerText = 'ESPERANDO LECTURA...';
        
        document.getElementById('chkConsumo').checked = false; 
        CapturaAPI.cambiarModoVisual(true); 

        CapturaAPI.estado='ESPERA';
        setTimeout(()=>inp.focus(), 50);
    },

    cargarHistorial: () => {
        fetch(CapturaAPI.baseApi + 'api_captura_historial.php?t=' + Date.now())
            .then(r=>r.text())
            .then(h=>{
                document.getElementById('tablaHistorialBody').innerHTML=h;
                const count = (h.match(/<tr/g) || []).length;
                document.getElementById('lblConteoHistorial').innerText = `${count} regs`;
            });
    }
};

setTimeout(() => { CapturaAPI.init(); }, 100);
</script>