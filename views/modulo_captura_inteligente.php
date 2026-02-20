<?php
if (session_status() === PHP_SESSION_NONE) { session_start(); }
$nombre_usuario = $_SESSION['nombre'] ?? 'Operador';
?>

<style>
    .table-fixed-head thead { position: sticky; top: 0; z-index: 10; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    
    .btn-uso { background-color: #f97316 !important; color: white !important; }
    .btn-uso:hover { background-color: #ea580c !important; }
    .input-uso { border-color: #f97316 !important; color: #c2410c !important; background-color: #fff7ed !important; }
</style>

<div class="h-screen flex flex-col font-sans select-none bg-gray-100">
    
    <div class="bg-white border-b border-gray-300 px-6 py-3 flex justify-between items-center shrink-0 z-20 shadow-sm">
        <h1 class="text-xl font-black text-gray-800 tracking-tight">CAPTURA DE INVENTARIO</h1>
        <div class="flex items-center gap-4">
            <span class="text-sm font-bold text-gray-500 uppercase"><?= htmlspecialchars($nombre_usuario) ?></span>
            <button onclick="CapturaAPI.cargarHistorial()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded font-bold text-sm transition-colors">
                ↻ RECARGAR
            </button>
        </div>
    </div>

    <div class="flex-1 overflow-hidden p-4 max-w-7xl mx-auto w-full flex flex-col gap-4">

        <div class="bg-white border border-gray-300 rounded-lg p-6 shadow-sm shrink-0">
            
            <div class="flex gap-4 mb-6">
                <div class="w-1/3">
                    <label class="block text-xs font-black text-gray-500 uppercase mb-1">CÓDIGO DE BARRAS</label>
                    <input type="text" id="inpCodigo" 
                        onkeydown="if(event.key==='Enter') { event.preventDefault(); CapturaAPI.verificar(this.value); }"
                        class="w-full h-14 px-4 text-3xl font-mono font-black text-black bg-gray-50 border-2 border-gray-300 focus:border-blue-600 focus:bg-white outline-none rounded transition-colors placeholder:text-gray-300" 
                        placeholder="Escanear..." autofocus autocomplete="off">
                </div>

                <div class="flex-1 bg-blue-50 border-2 border-blue-100 rounded px-4 flex flex-col justify-center relative overflow-hidden transition-colors" id="cardNombreProducto">
                    <span class="text-xs font-black text-blue-500 uppercase" id="lblEstado">ESPERANDO LECTURA...</span>
                    <h2 class="text-2xl font-black text-gray-900 truncate leading-tight mt-1" id="lblNombreProducto">---</h2>
                    
                    <div id="zonaVincular" class="hidden absolute inset-0 bg-yellow-50 flex items-center px-4 gap-4 z-10 transition-all">
                        <span class="text-yellow-800 font-black whitespace-nowrap">⚠ NUEVO: VINCULAR PIEZA</span>
                        <input type="text" id="inpVinculo" 
                            onkeydown="if(event.key==='Enter') { event.preventDefault(); CapturaAPI.buscarVinculo(this.value); }"
                            class="flex-1 h-10 px-3 font-bold border-2 border-yellow-400 bg-white rounded outline-none"
                            placeholder="Escanea el código de la pieza suelta aquí">
                    </div>
                </div>
            </div>

            <div id="zonaInputs" class="hidden">
                <div class="grid grid-cols-12 gap-4 items-end bg-gray-50 p-4 rounded border border-gray-200 transition-colors" id="cardInputs">
                    
                    <div class="col-span-2">
                        <label class="block text-xs font-black text-gray-400 uppercase mb-1 text-center">SUELTOS (PZ)</label>
                        <input type="number" id="inpExistencia" oninput="CapturaAPI.calcular()"
                            class="w-full h-16 text-center text-3xl font-bold text-gray-500 border border-gray-300 rounded focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-colors" value="0">
                    </div>

                    <div class="col-span-3">
                        <label class="block text-xs font-black text-blue-700 uppercase mb-1 text-center" id="lblBultos">BULTOS / CAJAS</label>
                        <input type="number" id="inpBultos" oninput="CapturaAPI.calcular()"
                            class="w-full h-20 text-center text-5xl font-black text-blue-800 border-2 border-blue-200 bg-white rounded focus:border-blue-600 outline-none shadow-sm transition-colors" value="0">
                    </div>

                    <div class="col-span-2">
                        <label class="block text-xs font-black text-gray-400 uppercase mb-1 text-center">PIEZAS X BULTO</label>
                        <input type="number" id="inpFactor" oninput="CapturaAPI.calcular()"
                            class="w-full h-16 text-center text-2xl font-bold text-gray-600 border border-gray-300 border-dashed rounded focus:border-blue-500 outline-none bg-white" value="1">
                    </div>

                    <div class="col-span-5 flex flex-col justify-end h-20 gap-2">
                        <div class="flex justify-end items-center pr-1">
                            <label class="flex items-center cursor-pointer select-none group">
                                <span class="text-[10px] font-black text-gray-400 group-hover:text-orange-600 mr-2 uppercase transition-colors">¿ES PARA USO?</span>
                                <input type="checkbox" id="chkConsumo" class="w-5 h-5 accent-orange-600 cursor-pointer border-gray-300 rounded" onchange="CapturaAPI.cambiarModoVisual()">
                            </label>
                        </div>

                        <button id="btnConfirmar" onclick="CapturaAPI.guardar()" disabled
                            class="w-full h-14 bg-gray-300 text-gray-500 font-black text-2xl rounded shadow-sm transition-all flex justify-between items-center px-6 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span id="txtBtnGuardar">CONFIRMAR</span>
                            <div class="text-right leading-none">
                                <span class="block text-[9px] font-normal">TOTAL PZ</span>
                                <span id="lblBtnTotal" class="font-mono">0</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="flex-1 bg-white border border-gray-300 rounded-lg overflow-hidden flex flex-col min-h-0">
            <div class="bg-gray-100 px-4 py-2 border-b border-gray-300 flex justify-between items-center shrink-0">
                <span class="font-bold text-gray-600 text-sm uppercase">HISTORIAL DE HOY</span>
                <span class="bg-white px-2 py-0.5 rounded border border-gray-300 text-xs font-mono font-bold" id="lblConteoHistorial">0 regs</span>
            </div>
            
            <div class="overflow-y-auto flex-1">
                <table class="w-full text-left border-collapse table-fixed-head">
                    <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0 shadow-sm">
                        <tr>
                            <th class="p-3 border-b border-gray-200 w-32">CÓDIGO</th>
                            <th class="p-3 border-b border-gray-200">DESCRIPCIÓN</th>
                            <th class="p-3 border-b border-gray-200 text-center w-24">USO</th>
                            <th class="p-3 border-b border-gray-200 text-center w-20">CANT.</th>
                            <th class="p-3 border-b border-gray-200 text-right pr-6 w-24">TOTAL</th>
                            <th class="p-3 border-b border-gray-200 w-10"></th>
                        </tr>
                    </thead>
                    <tbody id="tablaHistorialBody" class="text-sm text-gray-800 font-medium divide-y divide-gray-100">
                        <tr><td colspan="6" class="text-center py-8 text-gray-400">Cargando datos...</td></tr>
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

        // Listeners Modo Turbo (Enter)
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

    // --- CEREBRO INTELIGENTE ---
    cambiarModoVisual: () => {
        const isConsumo = document.getElementById('chkConsumo').checked;
        const btn = document.getElementById('btnConfirmar');
        const txtBtn = document.getElementById('txtBtnGuardar');
        
        const inpBultos = document.getElementById('inpBultos');
        const inpExistencia = document.getElementById('inpExistencia');
        const inpFactor = document.getElementById('inpFactor');
        const zonaVincular = document.getElementById('zonaVincular');

        if (isConsumo) {
            // MODO USO (Gasto)
            if (!zonaVincular.classList.contains('hidden')) {
                zonaVincular.classList.add('hidden'); 
                inpFactor.value = 1; 
                document.getElementById('lblNombreProducto').innerText = "Producto Manual (Uso)";
            }

            if(inpFactor.value === '' || inpFactor.value == 0) inpFactor.value = 1;
            inpBultos.value = 0;
            inpBultos.disabled = true; 
            
            // Si está en 0, sugerimos 1 pieza
            if(parseFloat(inpExistencia.value) === 0) inpExistencia.value = 1;
            
            // Estilos
            btn.classList.add('btn-uso');
            inpExistencia.classList.add('input-uso');
            txtBtn.innerText = "REGISTRAR USO";
            
            inpExistencia.focus();

        } else {
            // MODO VENTA (Inventario)
            if (CapturaAPI.datos.registrar_nuevo && !CapturaAPI.datos.clave_sicar) {
                zonaVincular.classList.remove('hidden');
                document.getElementById('lblNombreProducto').innerText = "---";
            }

            btn.classList.remove('btn-uso');
            inpExistencia.classList.remove('input-uso');
            inpBultos.disabled = false;
            txtBtn.innerText = "CONFIRMAR";
            
            inpBultos.focus();
        }
        CapturaAPI.calcular();
    },

    verificar: (codigo) => {
        codigo = codigo.trim(); if(!codigo) return;
        const inp = document.getElementById('inpCodigo');
        inp.disabled = true; 
        document.getElementById('lblEstado').innerText = "BUSCANDO...";
        
        const fd = new FormData(); fd.append('codigo', codigo);
        fetch(CapturaAPI.baseApi + 'api_captura_verificar.php', {method:'POST', body:fd})
            .then(r => r.json())
            .then(d => {
                const nombre = d.descripcion_caja || "PRODUCTO DESCONOCIDO";
                CapturaAPI.prepararUI(d, codigo, nombre);
            })
            .catch(() => CapturaAPI.resetear());
    },

    buscarVinculo: (codigo) => {
        codigo = codigo.trim(); if(!codigo) return;
        const fd = new FormData(); fd.append('codigo', codigo);
        fetch(CapturaAPI.baseApi + 'api_buscar_producto.php', {method:'POST', body:fd})
            .then(r=>r.json()).then(d => {
                if(d.success) {
                    document.getElementById('zonaVincular').classList.add('hidden');
                    document.getElementById('lblNombreProducto').innerText = d.data.descripcion; 
                    CapturaAPI.datos.clave_sicar = d.data.clave_sicar;
                    CapturaAPI.datos.nombre_suelto = d.data.descripcion; 
                    document.getElementById('inpFactor').focus();
                    CapturaAPI.calcular();
                } else {
                    const v = document.getElementById('inpVinculo');
                    v.style.borderColor = 'red'; setTimeout(()=>v.style.borderColor='', 500); v.value='';
                }
            });
    },

    prepararUI: (d, codigo, nombre) => {
        document.getElementById('zonaInputs').classList.remove('hidden');
        CapturaAPI.datos = { ...d, codigo: codigo, nombre_caja: nombre, registrar_nuevo: false };
        document.getElementById('lblNombreProducto').innerText = nombre;
        document.getElementById('lblEstado').innerText = "LISTO PARA CAPTURAR";

        const vinculoDiv = document.getElementById('zonaVincular');
        const inpFactor = document.getElementById('inpFactor');
        const chkConsumo = document.getElementById('chkConsumo');

        // MEMORIA DEL PRODUCTO
        if (d.modo_preferido === 'CONSUMO') {
            chkConsumo.checked = true;
        } else {
            chkConsumo.checked = false;
        }

        if (d.tipo !== 'DESCONOCIDO') {
            // CONOCIDO
            vinculoDiv.classList.add('hidden');
            CapturaAPI.datos.nombre_suelto = nombre; 
            inpFactor.value = d.factor; 
            inpFactor.disabled = true; 
            inpFactor.classList.add('bg-gray-100');
            
            CapturaAPI.cambiarModoVisual(); 

        } else {
            // NUEVO
            document.getElementById('lblEstado').innerText = "PRODUCTO NUEVO";
            CapturaAPI.datos.registrar_nuevo = true;
            
            CapturaAPI.cambiarModoVisual(); 
            
            if(!chkConsumo.checked) {
                vinculoDiv.classList.remove('hidden');
                document.getElementById('inpVinculo').value = '';
                setTimeout(() => document.getElementById('inpVinculo').focus(), 50);
            } else {
                inpFactor.value = 1;
            }
            inpFactor.disabled = false; 
            inpFactor.classList.remove('bg-gray-100');
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
                btn.className = "w-full h-14 bg-orange-600 hover:bg-orange-700 text-white font-black text-2xl rounded shadow-sm transition-all flex justify-between items-center px-6";
                document.getElementById('txtBtnGuardar').innerText = "REGISTRAR USO";
            } else {
                btn.className = "w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black text-2xl rounded shadow-sm transition-all flex justify-between items-center px-6";
                document.getElementById('txtBtnGuardar').innerText = "CONFIRMAR";
            }
        } else {
            btn.disabled = true;
            btn.className = "w-full h-14 bg-gray-300 text-gray-500 font-black text-2xl rounded shadow-sm flex justify-between items-center px-6 cursor-not-allowed";
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
        fd.append('clave_sicar', CapturaAPI.datos.clave_sicar || '');
        
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
                        Swal.fire({
                            toast: true, position: 'top-end', icon: 'success', 
                            title: isConsumo ? 'Uso Registrado' : 'Guardado', 
                            showConfirmButton: false, timer: 1500
                        });
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
        
        // Reset checkbox
        document.getElementById('chkConsumo').checked = false; 
        CapturaAPI.cambiarModoVisual(); 

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

CapturaAPI.init();
</script>