<?php
// views/modulo_traspasos.php
session_start();
require_once '../config/db.php';

$usuario_id = $_SESSION['user_id'] ?? 0; 
$rol = $_SESSION['rol'] ?? 'empleado';

// =====================================================================
// API INTEGRADA: BÚSQUEDA Y GUARDADO DE TRASPASOS
// =====================================================================
$accion = $_GET['accion'] ?? '';

if ($accion === 'buscar_producto') {
    header('Content-Type: application/json');
    $q = trim($_GET['q'] ?? '');
    
    try {
        $sql = "SELECT clave_sicar as id, clave_sicar as codigo, descripcion, existencia as stock_matriz 
                FROM cat_productos 
                WHERE clave_sicar = :q1 OR codigo_barras = :q2 LIMIT 1";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':q1' => $q, ':q2' => $q]);
        $prod = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($prod) {
            echo json_encode(['success' => true, 'exacto' => true, 'data' => $prod]);
        } else {
            $sqlLike = "SELECT clave_sicar as id, clave_sicar as codigo, descripcion, existencia as stock_matriz 
                        FROM cat_productos 
                        WHERE descripcion LIKE :qlike LIMIT 10";
            $stmtLike = $pdo->prepare($sqlLike);
            $stmtLike->execute([':qlike' => '%' . $q . '%']);
            $similares = $stmtLike->fetchAll(PDO::FETCH_ASSOC);
            
            if (count($similares) > 0) {
                echo json_encode(['success' => true, 'exacto' => false, 'data' => $similares]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Producto no encontrado en el catálogo']);
            }
        }
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

if ($accion === 'guardar_traspaso') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $pdo->beginTransaction();
        
        $stmt = $pdo->prepare("INSERT INTO traspasos (usuario_creador_id, fecha, estado) VALUES (?, NOW(), 'PENDIENTE')");
        $stmt->execute([$usuario_id]);
        $traspaso_id = $pdo->lastInsertId();
        
        $stmtDetalle = $pdo->prepare("INSERT INTO traspaso_detalles (traspaso_id, clave_sicar, cantidad) VALUES (?, ?, ?)");
        
        foreach ($input['productos'] as $prod) {
            $stmtDetalle->execute([$traspaso_id, $prod['id'], $prod['cantidad']]);
        }
        
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Orden de traspaso #'.$traspaso_id.' guardada con éxito.']);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'error' => 'Error al guardar en BD: ' . $e->getMessage()]);
    }
    exit;
}
// =====================================================================
?>

<script>
    window.userRol = '<?= $rol ?>';
    window.userId = '<?= $usuario_id ?>';
</script>

<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
    #modulo-traspasos { font-family: 'Plus Jakarta Sans', sans-serif; }
    #modulo-traspasos ::-webkit-scrollbar { width: 8px; height: 8px; }
    #modulo-traspasos ::-webkit-scrollbar-track { background: transparent; }
    #modulo-traspasos ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    #modulo-traspasos ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .glass-panel { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6); }
    .shadow-soft { box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); }
</style>

<div id="modulo-traspasos" class="h-full overflow-y-auto p-4 md:p-6 lg:p-8 bg-slate-50 selection:bg-indigo-100 pb-20 custom-scrollbar">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 lg:mb-8 gap-4">
        <div>
            <h1 class="text-3xl lg:text-4xl font-black text-slate-800 flex items-center gap-3 lg:gap-4 tracking-tight">
                <div class="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
                    <i class="bi bi-box-arrow-right text-white text-xl lg:text-2xl"></i>
                </div>
                Generar Traspaso
            </h1>
            <p class="text-sm lg:text-base text-slate-500 font-bold ml-1 mt-1 uppercase tracking-widest">Salida de Mercancía</p>
        </div>
        <button class="bg-red-50 hover:bg-red-100 text-red-500 font-bold px-4 py-2 lg:px-6 lg:py-3 rounded-xl transition-colors flex items-center gap-2 text-xs lg:text-sm uppercase tracking-widest shadow-sm" onclick="TraspasosAPI.limpiarTodo()">
            <i class="bi bi-trash3-fill"></i> Limpiar Lista
        </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 flex-1">
        
        <div class="lg:col-span-2 flex flex-col gap-6 lg:gap-8">
            
            <div class="glass-panel p-6 lg:p-8 rounded-3xl shadow-soft border border-slate-200 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-40 h-40 bg-indigo-100 rounded-full blur-3xl opacity-50 -mr-10 -mt-10 pointer-events-none"></div>
                <h2 class="text-xs lg:text-sm font-extrabold text-slate-400 uppercase tracking-widest mb-3 lg:mb-4">Escanea el Código de Barras</h2>
                
                <div class="relative w-full group">
                    <div class="absolute inset-y-0 left-0 pl-5 lg:pl-6 flex items-center pointer-events-none">
                        <i class="bi bi-upc-scan text-2xl lg:text-3xl text-slate-400 group-focus-within:text-indigo-500 transition-colors"></i>
                    </div>
                    <input type="text" id="inpEscaner" 
                           class="w-full h-16 lg:h-20 pl-16 lg:pl-20 pr-4 bg-white border-2 border-slate-200 rounded-2xl text-xl lg:text-2xl font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm placeholder:text-slate-300 placeholder:font-medium" 
                           placeholder="Ej. 880, 750... o Descripción" autocomplete="off">
                </div>
            </div>

            <div class="glass-panel border border-slate-200 rounded-3xl shadow-soft flex flex-col overflow-hidden">
                <div class="px-6 py-4 lg:py-5 border-b border-slate-100 flex justify-between items-center bg-white/50">
                    <h3 class="text-sm lg:text-base font-black text-slate-700 uppercase tracking-widest">Lista de Artículos</h3>
                    <span class="bg-indigo-50 text-indigo-600 px-3 lg:px-4 py-1 lg:py-1.5 rounded-lg text-xs lg:text-sm font-black border border-indigo-100 shadow-sm" id="badgeContador">0 Productos</span>
                </div>
                
                <div class="flex-1 overflow-x-auto p-2 lg:p-4">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100/80 text-slate-400 text-xs lg:text-sm uppercase font-extrabold tracking-wider rounded-xl">
                            <tr>
                                <th class="p-4 lg:p-5 border-b border-slate-200 rounded-tl-xl">Descripción / Código</th>
                                <?php if ($rol === 'admin'): ?>
                                    <th class="p-4 lg:p-5 border-b border-slate-200 text-center w-24 lg:w-32">Stock</th>
                                <?php endif; ?>
                                <th class="p-4 lg:p-5 border-b border-slate-200 text-center w-32 lg:w-40">Cantidad</th>
                                <th class="p-4 lg:p-5 border-b border-slate-200 text-right w-12 lg:w-16 rounded-tr-xl"></th>
                            </tr>
                        </thead>
                        <tbody id="tablaTraspaso" class="text-base font-medium divide-y divide-slate-100">
                            </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="glass-panel border border-slate-200 rounded-3xl shadow-soft flex flex-col h-auto relative p-6 lg:p-8 gap-4 lg:gap-6 self-start sticky top-6 lg:top-8">
            <div class="bg-slate-800 rounded-2xl p-6 lg:p-10 shadow-inner text-center transition-colors relative overflow-hidden" id="boxResumen">
                <div class="absolute top-0 left-0 w-full h-1.5 lg:h-2 bg-slate-700" id="barraEstado"></div>
                <span class="text-slate-400 text-xs lg:text-sm uppercase font-black tracking-widest block mb-2">Total a Traspasar</span>
                <span class="text-6xl lg:text-8xl font-black text-white tracking-tighter drop-shadow-md" id="totalPiezas">0</span>
                <span class="text-slate-500 text-sm lg:text-base font-bold block mt-2">Piezas / Unidades</span>
            </div>

            <button id="btnConfirmar" disabled onclick="TraspasosAPI.enviarTraspaso()"
                    class="w-full h-14 lg:h-16 rounded-2xl font-black text-white shadow-lg lg:shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-base lg:text-lg mt-2 lg:mt-4 flex items-center justify-center gap-2 lg:gap-3">
                <i class="bi bi-check-circle-fill text-xl lg:text-2xl"></i> CONFIRMAR ORDEN
            </button>
        </div>

    </div>
</div>

<script>
(() => {
    const KEY_MEMORIA = 'traspaso_borrador_user_' + window.userId;
    let listaProductos = [];

    // Buscamos los elementos dinámicamente cada vez que se requieran
    const getEl = (id) => document.getElementById(id);

    const initEscaner = () => {
        const inp = getEl('inpEscaner');
        if(!inp) return;
        setTimeout(() => inp.focus(), 300);

        // Limpiar eventos previos para evitar duplicados en recargas SPA
        inp.replaceWith(inp.cloneNode(true));
        const newInp = getEl('inpEscaner');
        
        newInp.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') {
                e.preventDefault();
                TraspasosAPI.buscarProducto(newInp.value);
            }
        });
    };

    window.TraspasosAPI = {
        init: () => {
            const guardado = localStorage.getItem(KEY_MEMORIA);
            if (guardado) {
                try {
                    listaProductos = JSON.parse(guardado);
                } catch (e) {
                    listaProductos = [];
                }
            }
            initEscaner();
            TraspasosAPI.renderizarTabla();
        },

        buscarProducto: (query) => {
            const q = query.trim();
            if(!q) return;

            const inp = getEl('inpEscaner');
            if(inp) inp.disabled = true;

            fetch(`views/modulo_traspasos.php?accion=buscar_producto&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(res => {
                    if (res.success) {
                        if (res.exacto) {
                            TraspasosAPI.agregarProducto(res.data);
                        } else {
                            Swal.fire({
                                icon: 'info', title: 'Múltiples Resultados',
                                text: `Se encontraron ${res.data.length} productos con un nombre similar. Usa el código de barras exacto.`,
                                confirmButtonColor: '#4f46e5'
                            });
                        }
                    } else {
                        if(inp) {
                            inp.classList.add('border-red-500', 'bg-red-50');
                            setTimeout(() => inp.classList.remove('border-red-500', 'bg-red-50'), 500);
                        }
                        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: res.error, showConfirmButton: false, timer: 1500 });
                    }
                })
                .finally(() => {
                    if(inp) {
                        inp.value = '';
                        inp.disabled = false;
                        inp.focus();
                    }
                });
        },

        agregarProducto: (prod) => {
            const index = listaProductos.findIndex(p => p.id === prod.id);
            if (index > -1) {
                listaProductos[index].cantidad_envio += 1;
            } else {
                listaProductos.push({
                    id: prod.id, codigo: prod.codigo, descripcion: prod.descripcion,
                    stock: parseFloat(prod.stock_matriz) || 0, cantidad_envio: 1
                });
            }
            TraspasosAPI.guardarMemoria();
            TraspasosAPI.renderizarTabla();
            Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'Agregado', showConfirmButton: false, timer: 800 });
        },

        actualizarCantidad: (index, valor) => {
            let val = parseFloat(valor);
            if(isNaN(val) || val <= 0) val = 1;
            listaProductos[index].cantidad_envio = val;
            TraspasosAPI.guardarMemoria();
            TraspasosAPI.actualizarTotales(); 
        },

        eliminarFila: (index) => {
            listaProductos.splice(index, 1);
            TraspasosAPI.guardarMemoria();
            TraspasosAPI.renderizarTabla();
        },

        limpiarTodo: () => {
            if(listaProductos.length === 0) return;
            Swal.fire({
                title: '¿Limpiar lista?', icon: 'warning', showCancelButton: true,
                confirmButtonColor: '#ef4444', confirmButtonText: 'Sí, borrar todo', cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    listaProductos = [];
                    TraspasosAPI.guardarMemoria(); 
                    TraspasosAPI.renderizarTabla();
                    if(getEl('inpEscaner')) getEl('inpEscaner').focus();
                }
            });
        },

        guardarMemoria: () => {
            localStorage.setItem(KEY_MEMORIA, JSON.stringify(listaProductos));
        },

        renderizarTabla: () => {
            const tabla = getEl('tablaTraspaso');
            if(!tabla) return;
            
            const numColumnas = window.userRol === 'admin' ? 4 : 3;

            if (listaProductos.length === 0) {
                tabla.innerHTML = `<tr><td colspan="${numColumnas}" class="p-12 lg:p-20 text-center text-slate-400"><i class="bi bi-upc-scan text-6xl lg:text-7xl mb-4 block opacity-50"></i><span class="font-bold text-base lg:text-lg tracking-tight">Escanea un producto para agregarlo a la lista</span></td></tr>`;
                TraspasosAPI.actualizarTotales();
                return;
            }

            let html = '';
            [...listaProductos].reverse().forEach((p, reverseIndex) => {
                const index = listaProductos.length - 1 - reverseIndex;
                let celdaStock = '';
                if (window.userRol === 'admin') {
                    celdaStock = `<td class="p-4 lg:p-5 align-middle text-center"><span class="text-sm lg:text-base font-bold text-slate-500">${p.stock}</span></td>`;
                }

                html += `
                <tr class="hover:bg-slate-50/80 transition-colors group">
                    <td class="p-4 lg:p-5 align-middle">
                        <div class="font-black text-slate-800 text-base lg:text-lg leading-snug tracking-tight mb-1.5">${p.descripcion}</div>
                        <span class="bg-slate-100 text-slate-500 border border-slate-200 px-2 lg:px-3 py-0.5 lg:py-1 rounded-md font-mono text-xs font-bold shadow-sm"><i class="bi bi-upc"></i> ${p.codigo}</span>
                    </td>
                    ${celdaStock}
                    <td class="p-4 lg:p-5 align-middle text-center">
                        <div class="flex items-center justify-center">
                            <input type="number" step="any"
                                   class="w-24 lg:w-28 h-12 lg:h-14 bg-white border-2 border-indigo-100 text-indigo-700 rounded-xl px-2 text-center focus:outline-none focus:border-indigo-500 text-xl lg:text-2xl font-black transition-all shadow-sm" 
                                   min="0.1" value="${p.cantidad_envio}"
                                   onchange="TraspasosAPI.actualizarCantidad(${index}, this.value)" onfocus="this.select()">
                        </div>
                    </td>
                    <td class="p-4 lg:p-5 align-middle text-right">
                        <button onclick="TraspasosAPI.eliminarFila(${index})" class="text-slate-300 hover:text-red-500 hover:bg-red-50 w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center transition-all text-lg lg:text-xl"><i class="bi bi-x-lg"></i></button>
                    </td>
                </tr>`;
            });
            tabla.innerHTML = html;
            TraspasosAPI.actualizarTotales();
        },

        actualizarTotales: () => {
            const numProductos = listaProductos.length;
            let sumaPiezas = 0;
            listaProductos.forEach(p => sumaPiezas += parseFloat(p.cantidad_envio));

            if(getEl('badgeContador')) getEl('badgeContador').innerText = `${numProductos} Productos`;
            if(getEl('totalPiezas')) getEl('totalPiezas').innerText = sumaPiezas;

            const hasItems = numProductos > 0;
            const btnConf = getEl('btnConfirmar');
            const boxRes = getEl('boxResumen');
            const bEstado = getEl('barraEstado');
            const tPiezas = getEl('totalPiezas');

            if(btnConf) btnConf.disabled = !hasItems;

            if(boxRes && bEstado && tPiezas) {
                if(hasItems) {
                    boxRes.classList.remove('bg-slate-800'); boxRes.classList.add('bg-indigo-600');
                    tPiezas.classList.add('text-white');
                    bEstado.classList.replace('bg-slate-700', 'bg-emerald-400');
                } else {
                    boxRes.classList.add('bg-slate-800'); boxRes.classList.remove('bg-indigo-600');
                    bEstado.classList.replace('bg-emerald-400', 'bg-slate-700');
                }
            }
        },

        enviarTraspaso: () => {
            const payload = listaProductos.map(p => ({ id: p.id, cantidad: p.cantidad_envio }));
            const btnConf = getEl('btnConfirmar');

            if(btnConf) {
                btnConf.disabled = true;
                btnConf.innerHTML = '<span class="loading loading-spinner loading-md"></span> Guardando...';
            }

            fetch('views/modulo_traspasos.php?accion=guardar_traspaso', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ productos: payload })
            })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    Swal.fire({icon: 'success', title: '¡Traspaso Exitoso!', text: res.message, timer: 2000, showConfirmButton: false});
                    listaProductos = [];
                    TraspasosAPI.guardarMemoria(); 
                    TraspasosAPI.renderizarTabla();
                    if(getEl('inpEscaner')) getEl('inpEscaner').focus();
                } else {
                    Swal.fire('Error', res.error || res.message, 'error');
                }
            })
            .catch(e => Swal.fire('Error', 'Fallo de conexión', 'error'))
            .finally(() => {
                if(btnConf) {
                    btnConf.disabled = false;
                    btnConf.innerHTML = '<i class="bi bi-check-circle-fill text-xl lg:text-2xl"></i> CONFIRMAR ORDEN';
                }
            });
        }
    };

    TraspasosAPI.init();
})();
</script>