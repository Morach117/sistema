<?php
// views/modulo_expo_compras.php
session_start();
require_once '../config/db.php';

$rol = $_SESSION['rol'] ?? 'empleado';
$usuario_id = $_SESSION['user_id'] ?? 0;

if ($rol !== 'admin') {
    die("<div class='p-10 flex flex-col items-center justify-center h-full'><h2 class='text-2xl font-black text-slate-700'>Acceso Denegado</h2><p class='text-slate-500'>Módulo exclusivo para compras.</p></div>");
}

// =====================================================================
// API INTEGRADA
// =====================================================================
$accion = $_GET['accion'] ?? '';

if ($accion === 'buscar_faltantes') {
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    
    $marca = trim($_GET['marca'] ?? '');
    $stock_max = intval($_GET['stock_max'] ?? 5);
    
    if (empty($marca)) {
        echo json_encode(['success' => false, 'error' => 'Escribe una marca']);
        exit;
    }
    
    try {
        $sql = "SELECT 
                    p.clave_sicar, 
                    p.codigo_barras, 
                    p.descripcion, 
                    p.existencia, 
                    p.precio_compra,
                    p.precio_venta,
                    COALESCE(v.cantidad_vendida, 0) as total_vendido
                FROM cat_productos p
                LEFT JOIN estadisticas_ventas v ON p.clave_sicar = v.clave_sicar
                WHERE p.descripcion LIKE :marca 
                AND p.existencia <= :stock_max 
                ORDER BY total_vendido DESC, p.descripcion ASC 
                LIMIT 150";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':marca' => '%' . $marca . '%', ':stock_max' => $stock_max]);
        $productos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $productos]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

if ($accion === 'guardar_orden') {
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $pdo->beginTransaction();
        
        $total = 0;
        foreach ($input['productos'] as $prod) {
            $total += ($prod['cantidad'] * $prod['precio_pactado']);
        }
        
        $stmt = $pdo->prepare("INSERT INTO ordenes_compra (usuario_id, proveedor_marca, estado, total_estimado) VALUES (?, ?, 'PEDIDO', ?)");
        $stmt->execute([$usuario_id, $input['proveedor'], $total]);
        $orden_id = $pdo->lastInsertId();
        
        $stmtDetalle = $pdo->prepare("INSERT INTO ordenes_compra_detalles (orden_id, clave_sicar, descripcion, cantidad_pedida, costo_unitario_pactado) VALUES (?, ?, ?, ?, ?)");
        
        foreach ($input['productos'] as $prod) {
            $stmtDetalle->execute([$orden_id, $prod['id'], $prod['descripcion'], $prod['cantidad'], $prod['precio_pactado']]);
        }
        
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Orden #'.$orden_id.' guardada.']);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}
?>

<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
    #modulo-expo { font-family: 'Plus Jakarta Sans', sans-serif; }
    #modulo-expo ::-webkit-scrollbar { width: 4px; height: 4px; }
    #modulo-expo ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    .glass-panel { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6); }
    
    /* Efecto suave para el scroll hacia el carrito */
    html { scroll-behavior: smooth; }
</style>

<div id="modulo-expo" class="h-full overflow-y-auto p-3 md:p-6 bg-slate-50 pb-28 custom-scrollbar">
    
    <div class="mb-4">
        <h1 class="text-2xl lg:text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
                <i class="bi bi-cart-check-fill text-white text-lg"></i>
            </div>
            Asistente de Expo
        </h1>
        <p class="text-[10px] lg:text-xs text-slate-500 font-bold ml-1 mt-1 uppercase tracking-widest">Inteligencia de Negocios</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 flex-1 relative">
        
        <div class="lg:col-span-2 flex flex-col gap-4">
            
            <div class="glass-panel p-4 lg:p-6 rounded-3xl shadow-sm border border-slate-200">
                <div class="flex flex-col sm:flex-row gap-3 w-full">
                    <div class="form-control w-full sm:w-1/3">
                        <label class="label pt-0 pb-1"><span class="label-text text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Máximo</span></label>
                        <select id="filtroStock" class="select select-bordered bg-slate-50 font-bold text-slate-700 h-12 w-full">
                            <option value="0">Agotados (0 pz)</option>
                            <option value="5" selected>Crítico (<= 5 pz)</option>
                            <option value="15">Bajo (<= 15 pz)</option>
                            <option value="999999">Todos</option>
                        </select>
                    </div>

                    <div class="form-control w-full sm:w-2/3 relative">
                        <label class="label pt-0 pb-1"><span class="label-text text-[10px] font-black text-slate-400 uppercase tracking-widest">Marca (Ej. Truper)</span></label>
                        <input type="text" id="filtroMarca" class="input input-bordered bg-slate-50 font-bold text-slate-700 h-12 w-full pr-12" onkeypress="if(event.key === 'Enter') ExpoAPI.buscar()">
                        <button onclick="ExpoAPI.buscar()" class="absolute right-2 bottom-2 w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center active:scale-95">
                            <i class="bi bi-search"></i>
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex justify-between items-end mb-1 px-2">
                <h3 class="text-sm font-black text-slate-700 uppercase tracking-widest">Sugerencias</h3>
                <span class="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-[10px] font-black" id="badgeResultados">0 Encontrados</span>
            </div>
            
            <div id="contenedorResultados" class="flex flex-col gap-3">
                <div class="p-10 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 border-dashed">
                    <i class="bi bi-search text-4xl block mb-2 opacity-30"></i>
                    <span class="font-bold text-sm">Busca una marca para analizar.</span>
                </div>
            </div>
        </div>

        <div id="zona-carrito" class="glass-panel border border-emerald-200 rounded-3xl shadow-xl flex flex-col h-[70vh] lg:h-[80vh] lg:sticky lg:top-6 overflow-hidden bg-white mt-4 lg:mt-0 scroll-mt-6">
            <div class="bg-emerald-600 p-4 text-white flex justify-between items-center z-10">
                <div>
                    <h3 class="font-black text-base"><i class="bi bi-receipt mr-2"></i> Orden de Compra</h3>
                    <p class="text-[9px] uppercase tracking-widest opacity-80 line-clamp-1" id="lblProveedorActivo">PROVEEDOR NO DEFINIDO</p>
                </div>
                <span class="bg-white/20 px-2 py-1 rounded text-xs font-bold" id="badgeCartCount">0 items</span>
            </div>
            
            <div class="flex-1 overflow-y-auto p-3 bg-slate-50 custom-scrollbar flex flex-col gap-2" id="contenedorCarrito"></div>

            <div class="p-4 bg-white border-t border-slate-200 z-10">
                <div class="flex justify-between items-end mb-3">
                    <span class="text-slate-400 text-[10px] uppercase font-black tracking-widest">Total Estimado</span>
                    <span class="text-3xl font-black text-slate-800" id="cartTotal">$0.00</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="CarritoAPI.limpiar()" class="btn btn-error btn-outline w-12 h-12 rounded-xl p-0"><i class="bi bi-trash3-fill text-lg"></i></button>
                    <button id="btnGuardarOrden" onclick="CarritoAPI.guardarOrden()" disabled class="flex-1 h-12 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                        CREAR ORDEN
                    </button>
                </div>
            </div>
        </div>

    </div>
</div>

<a href="#zona-carrito" id="btnFlotanteCart" class="lg:hidden fixed bottom-6 right-4 left-4 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center font-black active:scale-95 transition-transform z-50 border border-slate-700">
    <div class="flex items-center gap-2 text-sm">
        <i class="bi bi-cart-fill text-emerald-400 text-xl"></i>
        <span id="flotanteItems">0 items</span>
    </div>
    <div class="text-xl text-emerald-400" id="flotanteTotal">$0.00</div>
</a>

<script>
(() => {
    const KEY_CART = 'expo_cart_draft';
    const KEY_PROV = 'expo_cart_prov';

    window.CarritoAPI = {
        items: [], proveedor: '',

        init: () => {
            const memCart = localStorage.getItem(KEY_CART);
            const memProv = localStorage.getItem(KEY_PROV);
            if (memCart) CarritoAPI.items = JSON.parse(memCart);
            if (memProv) CarritoAPI.proveedor = memProv;
            CarritoAPI.render();
        },

        agregar: (idSicar, desc, codigo, costoHistorico, idx) => {
            const inputCant = document.getElementById(`cant-${idx}`).value;
            const inputPrecio = document.getElementById(`precio-${idx}`).value;
            
            const cant = parseFloat(inputCant);
            const precio = parseFloat(inputPrecio);

            if (isNaN(cant) || cant <= 0) return Swal.fire({toast:true, position:'top-center', icon:'error', title:'Cantidad inválida', showConfirmButton:false, timer:1500});
            if (isNaN(precio) || precio <= 0) return Swal.fire({toast:true, position:'top-center', icon:'error', title:'Precio inválido', showConfirmButton:false, timer:1500});

            if (CarritoAPI.items.length === 0) {
                CarritoAPI.proveedor = document.getElementById('filtroMarca').value.trim() || 'VARIOS';
                localStorage.setItem(KEY_PROV, CarritoAPI.proveedor);
            }

            const existe = CarritoAPI.items.findIndex(i => i.id === idSicar);
            if (existe > -1) {
                CarritoAPI.items[existe].cantidad = cant;
                CarritoAPI.items[existe].precio_pactado = precio;
            } else {
                CarritoAPI.items.push({ id: idSicar, descripcion: desc, codigo: codigo, costo_historico: parseFloat(costoHistorico), cantidad: cant, precio_pactado: precio });
            }

            localStorage.setItem(KEY_CART, JSON.stringify(CarritoAPI.items));
            CarritoAPI.render();
            ExpoAPI.renderizarTarjetas(); 
            Swal.fire({toast:true, position:'top-center', icon:'success', title:'Agregado', showConfirmButton:false, timer:800});
        },

        quitar: (idSicar) => {
            CarritoAPI.items = CarritoAPI.items.filter(i => i.id !== idSicar);
            if(CarritoAPI.items.length === 0) CarritoAPI.proveedor = '';
            localStorage.setItem(KEY_CART, JSON.stringify(CarritoAPI.items));
            localStorage.setItem(KEY_PROV, CarritoAPI.proveedor);
            CarritoAPI.render();
            ExpoAPI.renderizarTarjetas(); 
        },

        limpiar: () => {
            if(CarritoAPI.items.length === 0) return;
            Swal.fire({title:'¿Vaciar Orden?', text:'Se borrarán los datos.', icon:'warning', showCancelButton:true, confirmButtonColor:'#d33'}).then(r => {
                if(r.isConfirmed){
                    CarritoAPI.items = []; CarritoAPI.proveedor = '';
                    localStorage.removeItem(KEY_CART); localStorage.removeItem(KEY_PROV);
                    CarritoAPI.render(); ExpoAPI.renderizarTarjetas();
                }
            });
        },

        render: () => {
            const container = document.getElementById('contenedorCarrito');
            const lblProv = document.getElementById('lblProveedorActivo');
            const btnGuardar = document.getElementById('btnGuardarOrden');
            
            const numItems = CarritoAPI.items.length;
            document.getElementById('badgeCartCount').innerText = `${numItems} items`;
            document.getElementById('flotanteItems').innerText = `${numItems} items`;
            
            lblProv.innerText = CarritoAPI.proveedor ? CarritoAPI.proveedor : 'NO DEFINIDO';
            
            if (numItems === 0) {
                container.innerHTML = '<div class="p-8 text-center text-slate-400 opacity-50"><i class="bi bi-bag-x text-4xl mb-2 block"></i><span class="font-bold text-sm">Orden vacía</span></div>';
                document.getElementById('cartTotal').innerText = '$0.00';
                document.getElementById('flotanteTotal').innerText = '$0.00';
                btnGuardar.disabled = true; 
                return;
            }

            let html = ''; let sumaTotal = 0;

            [...CarritoAPI.items].reverse().forEach(item => {
                const subtotal = item.cantidad * item.precio_pactado;
                sumaTotal += subtotal;

                let iconAhorro = '';
                if(item.costo_historico > 0) {
                    if(item.precio_pactado < item.costo_historico) iconAhorro = '<span class="text-[9px] text-emerald-500 bg-emerald-50 px-1 rounded"><i class="bi bi-arrow-down"></i></span>';
                    else if(item.precio_pactado > item.costo_historico) iconAhorro = '<span class="text-[9px] text-red-500 bg-red-50 px-1 rounded"><i class="bi bi-arrow-up"></i></span>';
                }

                html += `
                <div class="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 relative pr-10">
                    <button onclick="CarritoAPI.quitar('${item.id}')" class="absolute top-1/2 -translate-y-1/2 right-2 text-slate-300 hover:text-red-500 p-2"><i class="bi bi-x-circle-fill text-lg"></i></button>
                    <div class="font-black text-slate-700 text-xs leading-tight mb-1 line-clamp-2">${item.descripcion}</div>
                    <div class="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                        <span class="bg-slate-100 px-1.5 rounded">${item.cantidad} pz</span> 
                        <span>x</span> 
                        <span class="text-slate-700">$${item.precio_pactado.toFixed(2)} ${iconAhorro}</span>
                        <span class="ml-auto font-black text-emerald-600 text-sm">$${subtotal.toFixed(2)}</span>
                    </div>
                </div>`;
            });

            container.innerHTML = html;
            const textTotal = `$${sumaTotal.toFixed(2)}`;
            document.getElementById('cartTotal').innerText = textTotal;
            document.getElementById('flotanteTotal').innerText = textTotal;
            btnGuardar.disabled = false;
        },

        guardarOrden: () => {
            const btn = document.getElementById('btnGuardarOrden');
            btn.disabled = true; btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span>';

            fetch('views/modulo_expo_compras.php?accion=guardar_orden', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ proveedor: CarritoAPI.proveedor, productos: CarritoAPI.items })
            })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    Swal.fire('¡Orden Guardada!', res.message, 'success');
                    CarritoAPI.items = []; CarritoAPI.proveedor = '';
                    localStorage.removeItem(KEY_CART); localStorage.removeItem(KEY_PROV);
                    CarritoAPI.render(); ExpoAPI.renderizarTarjetas();
                } else {
                    Swal.fire('Error', res.error, 'error');
                }
            })
            .finally(() => { btn.innerHTML = 'CREAR ORDEN'; });
        }
    };

    // ----------------------------------------------------
    // RENDERIZADO DE TARJETAS MÓVILES
    // ----------------------------------------------------
    window.ExpoAPI = {
        productos: [], mesesAnalisis: 7,

        buscar: () => {
            const marca = document.getElementById('filtroMarca').value.trim();
            const stockMax = document.getElementById('filtroStock').value;
            const cont = document.getElementById('contenedorResultados');

            if (!marca) return Swal.fire({toast: true, position: 'top-center', icon: 'warning', title: 'Escribe una marca', showConfirmButton: false, timer: 1500});
            
            cont.innerHTML = '<div class="text-center p-10"><span class="loading loading-spinner text-emerald-500 loading-lg"></span></div>';
            
            fetch(`views/modulo_expo_compras.php?accion=buscar_faltantes&marca=${encodeURIComponent(marca)}&stock_max=${stockMax}`)
                .then(r => r.json())
                .then(res => {
                    if (res.success) {
                        ExpoAPI.productos = res.data;
                        document.getElementById('badgeResultados').innerText = `${res.data.length}`;
                        ExpoAPI.renderizarTarjetas();
                    } else {
                        cont.innerHTML = `<div class="p-4 text-center text-red-500 font-bold">${res.error}</div>`;
                    }
                }).catch(e => { cont.innerHTML = '<div class="p-4 text-center text-red-500 font-bold">Error de red.</div>'; });
        },

        renderizarTarjetas: () => {
            const cont = document.getElementById('contenedorResultados');

            if (ExpoAPI.productos.length === 0) {
                cont.innerHTML = '<div class="p-10 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">Sin resultados.</div>';
                return;
            }

            let html = '';
            ExpoAPI.productos.forEach((p, index) => {
                const idSicar = p.clave_sicar;
                const stock = parseFloat(p.existencia);
                const precioCompra = parseFloat(p.precio_compra) || 0;
                const precioVenta = parseFloat(p.precio_venta) || 0;
                const totalVendido = parseFloat(p.total_vendido) || 0;
                
                // BI Sugerido
                let sugerido = '';
                if (totalVendido > 0) {
                    const vel = totalVendido / ExpoAPI.mesesAnalisis;
                    const stockIdeal = vel * 2; 
                    let calc = Math.ceil(stockIdeal - stock);
                    if (calc > 0) sugerido = calc;
                }

                // Margen
                let margenTxt = '-'; let margenColor = 'text-slate-400';
                if (precioCompra > 0 && precioVenta > 0) {
                    const porc = ((precioVenta - precioCompra) / precioVenta) * 100;
                    margenTxt = `${porc.toFixed(0)}%`;
                    margenColor = porc > 35 ? 'text-emerald-500' : (porc < 20 ? 'text-red-500' : 'text-amber-500');
                }

                // Ventas y Stock Visuales
                let ventasClass = totalVendido > 50 ? 'text-orange-500' : 'text-slate-800';
                let stockClass = stock === 0 ? 'text-red-500 bg-red-50' : (stock <= 5 ? 'text-amber-600 bg-amber-50' : 'text-slate-800 bg-slate-50');

                const enCarrito = CarritoAPI.items.find(i => i.id === idSicar);

                if (enCarrito) {
                    // TARJETA: YA EN CARRITO
                    html += `
                    <div class="bg-white p-4 rounded-3xl shadow-sm border border-emerald-200 relative opacity-70">
                        <div class="absolute top-3 right-3 bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black"><i class="bi bi-check-circle-fill"></i> EN ORDEN</div>
                        <h4 class="font-black text-slate-800 text-sm mb-1 pr-20 line-clamp-2">${p.descripcion}</h4>
                        <div class="text-[10px] text-slate-400 font-mono mb-3">${p.codigo_barras || idSicar}</div>
                        <div class="flex justify-between items-center">
                            <span class="text-xs font-bold text-slate-500">Pediste: <span class="text-emerald-600 font-black">${enCarrito.cantidad} pz</span></span>
                            <button onclick="CarritoAPI.quitar('${idSicar}')" class="btn btn-xs btn-error btn-outline rounded-lg">Quitar</button>
                        </div>
                    </div>`;
                } else {
                    // TARJETA: DISPONIBLE
                    html += `
                    <div class="bg-white p-4 rounded-3xl shadow-sm border border-slate-200">
                        <h4 class="font-black text-slate-800 text-sm mb-1 leading-snug">${p.descripcion}</h4>
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-[10px] text-slate-400 font-mono"><i class="bi bi-upc"></i> ${p.codigo_barras || idSicar}</span>
                            <span class="text-[10px] font-black text-slate-400">Ant: $${precioCompra.toFixed(2)}</span>
                        </div>
                        
                        <div class="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2 mb-3 border border-slate-100">
                            <div class="text-center border-r border-slate-200">
                                <div class="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">Vendido</div>
                                <div class="text-sm font-black ${ventasClass}">${totalVendido > 0 ? totalVendido : '0'}</div>
                            </div>
                            <div class="text-center border-r border-slate-200">
                                <div class="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">Stock</div>
                                <div class="text-sm font-black px-1 rounded ${stockClass}">${stock}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">Margen</div>
                                <div class="text-sm font-black ${margenColor}">${margenTxt}</div>
                            </div>
                        </div>

                        <div class="flex gap-2 items-stretch h-12">
                            <div class="relative w-20 shrink-0">
                                <span class="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[8px] font-black px-1.5 rounded-full z-10 ${sugerido ? '' : 'hidden'}">SUGERIDO</span>
                                <input type="number" inputmode="decimal" id="cant-${index}" value="${sugerido}" placeholder="Cant." class="w-full h-full bg-blue-50/50 border-2 border-blue-100 rounded-xl text-center text-sm font-black focus:border-blue-500 outline-none transition-colors">
                            </div>
                            
                            <div class="relative flex-1">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input type="number" inputmode="decimal" id="precio-${index}" value="${precioCompra > 0 ? precioCompra.toFixed(2) : ''}" placeholder="0.00" class="w-full h-full pl-7 pr-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-right text-sm font-black focus:border-emerald-500 outline-none transition-colors" step="any">
                            </div>

                            <button onclick="CarritoAPI.agregar('${idSicar}', '${p.descripcion.replace(/'/g, "\\'")}', '${p.codigo_barras || idSicar}', ${precioCompra}, ${index})" class="w-14 h-full bg-blue-600 active:bg-blue-800 text-white rounded-xl flex items-center justify-center transition-transform active:scale-90 shadow-md">
                                <i class="bi bi-plus-lg text-xl"></i>
                            </button>
                        </div>
                    </div>`;
                }
            });
            cont.innerHTML = html;
        }
    };

    CarritoAPI.init();
})();
</script>