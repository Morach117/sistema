<?php
// views/modulo_admin_traspasos.php
session_start();
require_once '../config/db.php';

$rol = $_SESSION['rol'] ?? 'empleado';
if ($rol !== 'admin') {
    die("<div class='p-10 flex flex-col items-center justify-center h-full'><h2 class='text-2xl font-black text-slate-700'>Acceso Denegado</h2><p class='text-slate-500'>Módulo exclusivo para administración.</p></div>");
}

$accion = $_GET['accion'] ?? '';

// API Interna: Ver detalles
if ($accion === 'ver_detalles') {
    header('Content-Type: application/json');
    $id = $_GET['id'] ?? 0;
    try {
        $sql = "SELECT td.id as detalle_id, td.clave_sicar, cp.descripcion, td.cantidad 
                FROM traspaso_detalles td 
                LEFT JOIN cat_productos cp ON td.clave_sicar = cp.clave_sicar 
                WHERE td.traspaso_id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$id]);
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

// API Interna: Guardar Validación y Marcar Completado
if ($accion === 'validar_traspaso') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $pdo->beginTransaction();
        
        // 1. Actualizar las cantidades reales que llegaron
        $stmtUpd = $pdo->prepare("UPDATE traspaso_detalles SET cantidad = ? WHERE id = ?");
        foreach ($input['items'] as $item) {
            $stmtUpd->execute([$item['cantidad_final'], $item['detalle_id']]);
        }
        
        // 2. Marcar el traspaso como COMPLETADO
        $stmtStatus = $pdo->prepare("UPDATE traspasos SET estado = 'COMPLETADO' WHERE id = ?");
        $stmtStatus->execute([$input['traspaso_id']]);
        
        $pdo->commit();
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

// Cargar la tabla principal
$sql = "SELECT t.*, u.usuario as nombre_usuario,
        (SELECT SUM(cantidad) FROM traspaso_detalles WHERE traspaso_id = t.id) as total_piezas,
        (SELECT COUNT(*) FROM traspaso_detalles WHERE traspaso_id = t.id) as total_items
        FROM traspasos t
        LEFT JOIN usuarios u ON t.usuario_creador_id = u.id
        ORDER BY t.fecha DESC LIMIT 300";
$stmt = $pdo->query($sql);
$traspasos = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>

<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
    #modulo-admin-traspasos { font-family: 'Plus Jakarta Sans', sans-serif; }
    #modulo-admin-traspasos ::-webkit-scrollbar { width: 8px; height: 8px; }
    #modulo-admin-traspasos ::-webkit-scrollbar-track { background: transparent; }
    #modulo-admin-traspasos ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    #modulo-admin-traspasos ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .glass-panel { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6); }
    .shadow-soft { box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); }
</style>

<div id="modulo-admin-traspasos" class="h-full overflow-y-auto p-4 md:p-6 lg:p-8 bg-slate-50 selection:bg-indigo-100 pb-20 custom-scrollbar">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 lg:mb-8 gap-4">
        <div>
            <h1 class="text-3xl lg:text-4xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
                <div class="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                    <i class="bi bi-inboxes-fill text-white text-xl lg:text-2xl"></i>
                </div>
                Gestión de Traspasos
            </h1>
            <p class="text-sm lg:text-base text-slate-500 font-bold ml-1 mt-1 uppercase tracking-widest">Validación y Autorización Sicar</p>
        </div>
        
        <div class="relative w-full md:w-72">
            <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="filtroTraspasos" onkeyup="AdminTraspasosAPI.filtrarTabla()" placeholder="Buscar folio o usuario..." class="w-full h-12 pl-12 pr-4 bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 outline-none font-bold text-slate-600 transition-all shadow-sm">
        </div>
    </div>

    <div class="glass-panel border border-slate-200 rounded-3xl shadow-soft flex flex-col overflow-hidden">
        <div class="overflow-x-auto p-2 lg:p-4">
            <table class="w-full text-left border-collapse" id="tablaTraspasosMaster">
                <thead class="bg-slate-100/80 text-slate-400 text-xs lg:text-sm uppercase font-extrabold tracking-wider rounded-xl">
                    <tr>
                        <th class="p-4 border-b border-slate-200 rounded-tl-xl">Folio / Fecha</th>
                        <th class="p-4 border-b border-slate-200">Enviado por</th>
                        <th class="p-4 border-b border-slate-200 text-center">Volumen Declarado</th>
                        <th class="p-4 border-b border-slate-200 text-center">Estado</th>
                        <th class="p-4 border-b border-slate-200 text-right rounded-tr-xl">Acciones</th>
                    </tr>
                </thead>
                <tbody class="text-base font-medium divide-y divide-slate-100">
                    <?php if(empty($traspasos)): ?>
                        <tr><td colspan="5" class="p-8 text-center text-slate-400 font-bold">No hay traspasos registrados.</td></tr>
                    <?php endif; ?>
                    
                    <?php foreach ($traspasos as $t): 
                        $esPendiente = ($t['estado'] === 'PENDIENTE');
                        $badgeColor = $esPendiente ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';
                        $busqueda = strtolower($t['id'] . ' ' . $t['nombre_usuario'] . ' ' . $t['estado']);
                    ?>
                    <tr id="fila-traspaso-<?= $t['id'] ?>" class="hover:bg-slate-50/80 transition-colors fila-busqueda" data-search="<?= $busqueda ?>">
                        <td class="p-4">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-500 font-black text-lg shadow-sm">
                                    #<?= $t['id'] ?>
                                </div>
                                <div>
                                    <div class="font-black text-slate-700"><?= date('d M Y', strtotime($t['fecha'])) ?></div>
                                    <div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest"><?= date('h:i A', strtotime($t['fecha'])) ?></div>
                                </div>
                            </div>
                        </td>
                        <td class="p-4 font-bold text-slate-600"><i class="bi bi-person-fill text-slate-400 mr-1"></i> <?= htmlspecialchars($t['nombre_usuario'] ?: 'Sistema') ?></td>
                        <td class="p-4 text-center">
                            <div class="flex flex-col items-center">
                                <span class="font-black text-slate-800"><?= floatval($t['total_piezas']) ?> pz</span>
                                <span class="text-[10px] text-slate-400 font-bold"><?= $t['total_items'] ?> códigos</span>
                            </div>
                        </td>
                        <td class="p-4 text-center" id="celda-estado-<?= $t['id'] ?>">
                            <span class="px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border <?= $badgeColor ?>"><?= $t['estado'] ?></span>
                        </td>
                        <td class="p-4 text-right">
                            <div class="flex justify-end gap-2" id="celda-acciones-<?= $t['id'] ?>">
                                <button id="btn-ver-<?= $t['id'] ?>" onclick="AdminTraspasosAPI.abrirModal(<?= $t['id'] ?>, '<?= $t['estado'] ?>')" class="bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-500 w-10 h-10 rounded-xl transition-all shadow-sm flex items-center justify-center active:scale-95 tooltip" data-tip="<?= $esPendiente ? 'Validar Recepción' : 'Ver Detalles' ?>">
                                    <i class="bi <?= $esPendiente ? 'bi-clipboard-check-fill text-amber-500' : 'bi-eye-fill' ?>"></i>
                                </button>
                                
                                <?php if ($esPendiente): ?>
                                    <button id="btn-excel-<?= $t['id'] ?>" onclick="Swal.fire({title:'Validación Requerida', text:'Abre la carpeta de validación y confirma la mercancía primero.', icon:'warning', customClass:{confirmButton:'bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg'}})" class="bg-slate-200 text-slate-400 w-10 h-10 rounded-xl flex items-center justify-center cursor-not-allowed tooltip tooltip-left" data-tip="Requiere Validación">
                                        <i class="bi bi-file-earmark-excel-fill text-lg"></i>
                                    </button>
                                <?php else: ?>
                                    <button id="btn-excel-<?= $t['id'] ?>" onclick="AdminTraspasosAPI.descargarExcel(<?= $t['id'] ?>)" class="bg-emerald-500 hover:bg-emerald-600 text-white w-10 h-10 rounded-xl shadow-md shadow-emerald-200 transition-all flex items-center justify-center active:scale-95 tooltip tooltip-left" data-tip="Descargar XML/Excel Sicar">
                                        <i class="bi bi-file-earmark-excel-fill text-lg"></i>
                                    </button>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<dialog id="modalDetalleTraspaso" class="modal modal-bottom sm:modal-middle" style="background: rgba(15,23,42,0.6); backdrop-filter: blur(4px);">
  <div class="modal-box w-11/12 max-w-4xl flex flex-col p-0 bg-slate-50 rounded-[2rem] overflow-hidden shadow-2xl border border-slate-300">
    
    <div class="glass-panel px-6 py-4 flex justify-between items-center sticky top-0 z-50 border-b border-slate-200">
        <div>
            <h3 class="font-black text-xl text-slate-800 tracking-tight"><i class="bi bi-box-seam text-indigo-500 mr-2"></i> Recepción de Traspaso #<span id="modTraspasoId"></span></h3>
            <p id="modInstrucciones" class="text-xs text-slate-500 font-bold mt-1">Verifica que lo físico coincida con el sistema.</p>
        </div>
        <form method="dialog"><button class="w-9 h-9 flex items-center justify-center bg-slate-200 hover:bg-red-500 text-slate-500 hover:text-white rounded-xl transition-colors"><i class="bi bi-x-lg"></i></button></form>
    </div>

    <div class="overflow-y-auto p-4 lg:p-6 custom-scrollbar max-h-[60vh]">
        <table class="w-full text-left border-collapse">
            <thead class="bg-slate-100 text-slate-400 text-[10px] uppercase font-extrabold tracking-wider rounded-lg">
                <tr>
                    <th class="p-3 border-b border-slate-200 rounded-tl-lg">Código Sicar</th>
                    <th class="p-3 border-b border-slate-200">Descripción</th>
                    <th class="p-3 border-b border-slate-200 text-center w-32">Cant. Enviada</th>
                    <th class="p-3 border-b border-slate-200 text-center w-32 rounded-tr-lg">Cant. Recibida</th>
                </tr>
            </thead>
            <tbody id="cuerpoModalTraspaso" class="text-sm text-slate-700 font-medium divide-y divide-slate-100">
                </tbody>
        </table>
    </div>

    <div id="footerModal" class="p-5 border-t border-slate-200 bg-white flex justify-end gap-3 hidden">
        <form method="dialog"><button class="px-6 h-12 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Cerrar</button></form>
        
        <button id="btnGuardarValidacion" onclick="AdminTraspasosAPI.guardarValidacion()" class="px-8 h-12 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2">
            <i class="bi bi-check-all text-xl"></i> Completar y Autorizar
        </button>
    </div>
  </div>
</dialog>

<script>
(() => {
    let currentTraspasoId = 0;

    window.AdminTraspasosAPI = {
        filtrarTabla: () => {
            const input = document.getElementById("filtroTraspasos").value.toLowerCase();
            const filas = document.querySelectorAll('.fila-busqueda');
            filas.forEach(fila => {
                const searchTxt = fila.getAttribute('data-search');
                fila.style.display = searchTxt.includes(input) ? '' : 'none';
            });
        },

        abrirModal: (id, estado) => {
            currentTraspasoId = id;
            document.getElementById('modTraspasoId').innerText = id;
            const cuerpo = document.getElementById('cuerpoModalTraspaso');
            const footer = document.getElementById('footerModal');
            const inst = document.getElementById('modInstrucciones');
            
            // Reiniciar estado del botón por si fue usado antes
            const btnGuardar = document.getElementById('btnGuardarValidacion');
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = '<i class="bi bi-check-all text-xl"></i> Completar y Autorizar';

            cuerpo.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-indigo-500"><span class="loading loading-dots loading-lg"></span></td></tr>';
            document.getElementById('modalDetalleTraspaso').showModal();

            if (estado === 'PENDIENTE') {
                footer.classList.remove('hidden');
                inst.innerText = "Modifica la cantidad recibida si llegó de más o de menos.";
                inst.classList.replace('text-emerald-600', 'text-amber-500');
            } else {
                footer.classList.add('hidden');
                inst.innerText = "Este traspaso ya fue validado y cerrado.";
                inst.classList.replace('text-amber-500', 'text-emerald-600');
            }

            fetch(`views/modulo_admin_traspasos.php?accion=ver_detalles&id=${id}`)
                .then(r => r.json())
                .then(res => {
                    if(res.success) {
                        let html = '';
                        res.data.forEach(item => {
                            let controlRecibido = estado === 'PENDIENTE' 
                                ? `<input type="number" step="any" class="input-val-cantidad w-20 h-10 border-2 border-indigo-200 focus:border-indigo-500 text-indigo-700 font-black text-center rounded-xl outline-none" data-id="${item.detalle_id}" value="${item.cantidad}">`
                                : `<span class="font-black text-emerald-600 text-lg">${item.cantidad} <i class="bi bi-check-circle-fill text-xs ml-1"></i></span>`;

                            html += `
                            <tr class="hover:bg-slate-50">
                                <td class="p-3 font-mono text-xs font-bold text-slate-500">${item.clave_sicar}</td>
                                <td class="p-3 font-bold text-slate-800">${item.descripcion || '---'}</td>
                                <td class="p-3 text-center font-bold text-slate-400 line-through decoration-slate-300">${item.cantidad} env.</td>
                                <td class="p-3 text-center">${controlRecibido}</td>
                            </tr>`;
                        });
                        cuerpo.innerHTML = html || '<tr><td colspan="4" class="text-center p-4">Sin datos</td></tr>';
                    } else {
                        cuerpo.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 p-4">${res.error}</td></tr>`;
                    }
                })
                .catch(e => {
                    cuerpo.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 p-4">Error de conexión</td></tr>`;
                });
        },

        // Nuevo Flujo de Guardado (Sin recargas y sin alertas dobles)
        guardarValidacion: () => {
            const inputs = document.querySelectorAll('.input-val-cantidad');
            let payloadItems = [];
            
            inputs.forEach(inp => {
                payloadItems.push({
                    detalle_id: inp.getAttribute('data-id'),
                    cantidad_final: parseFloat(inp.value) || 0
                });
            });

            // Cambiar botón a estado de carga
            const btnGuardar = document.getElementById('btnGuardarValidacion');
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Autorizando...';

            // Enviar a la base de datos
            fetch('views/modulo_admin_traspasos.php?accion=validar_traspaso', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ traspaso_id: currentTraspasoId, items: payloadItems })
            })
            .then(r => r.json())
            .then(res => {
                if(res.success) {
                    // 1. Cerrar el modal
                    document.getElementById('modalDetalleTraspaso').close();
                    
                    // 2. Mostrar alerta de éxito en la esquina (Toast no invasivo)
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Validado con éxito', showConfirmButton: false, timer: 2000 });
                    
                    // 3. ACTUALIZAR LA FILA EN TIEMPO REAL (DOM)
                    const celdaEstado = document.getElementById(`celda-estado-${currentTraspasoId}`);
                    if(celdaEstado) celdaEstado.innerHTML = `<span class="px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border bg-emerald-100 text-emerald-700 border-emerald-200">COMPLETADO</span>`;
                    
                    const btnVer = document.getElementById(`btn-ver-${currentTraspasoId}`);
                    if(btnVer) {
                        btnVer.setAttribute('onclick', `AdminTraspasosAPI.abrirModal(${currentTraspasoId}, 'COMPLETADO')`);
                        btnVer.setAttribute('data-tip', 'Ver Detalles');
                        btnVer.innerHTML = `<i class="bi bi-eye-fill"></i>`;
                    }
                    
                    const btnExcel = document.getElementById(`btn-excel-${currentTraspasoId}`);
                    if(btnExcel) {
                        // Cambiamos la clase gris por la verde y activamos la función
                        btnExcel.className = 'bg-emerald-500 hover:bg-emerald-600 text-white w-10 h-10 rounded-xl shadow-md shadow-emerald-200 transition-all flex items-center justify-center active:scale-95 tooltip tooltip-left';
                        btnExcel.setAttribute('data-tip', 'Descargar XML/Excel Sicar');
                        btnExcel.setAttribute('onclick', `AdminTraspasosAPI.descargarExcel(${currentTraspasoId})`);
                    }

                } else {
                    Swal.fire({title: 'Error', text: res.error, icon: 'error', customClass: {confirmButton: 'bg-indigo-600 text-white px-4 py-2 rounded'}});
                    btnGuardar.disabled = false;
                    btnGuardar.innerHTML = '<i class="bi bi-check-all text-xl"></i> Completar y Autorizar';
                }
            })
            .catch(e => {
                Swal.fire('Error', 'Fallo de conexión', 'error');
                btnGuardar.disabled = false;
            });
        },

        descargarExcel: (id) => {
            Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Generando Sicar...', showConfirmButton: false, timer: 1500 });
            window.open(`api/descargar_traspaso_sicar.php?id=${id}`, '_blank');
        }
    };
})();
</script>