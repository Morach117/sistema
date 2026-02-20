<?php
// views/modulo_devoluciones.php
session_start();
require_once '../config/db.php';
$rol = $_SESSION['rol'] ?? 'empleado';

function fecha_espanol($fecha_sql) {
    $timestamp = strtotime($fecha_sql);
    $meses = ['Jan'=>'Ene', 'Feb'=>'Feb', 'Mar'=>'Mar', 'Apr'=>'Abr', 'May'=>'May', 'Jun'=>'Jun', 'Jul'=>'Jul', 'Aug'=>'Ago', 'Sep'=>'Sep', 'Oct'=>'Oct', 'Nov'=>'Nov', 'Dec'=>'Dic'];
    $dia = date('d', $timestamp);
    $mes_ing = date('M', $timestamp);
    $hora = date('h:i A', $timestamp);
    return "$dia " . ($meses[$mes_ing] ?? $mes_ing) . " • $hora";
}

// CAMBIO: Buscamos revision_pendiente = 2
$sql = "SELECT hr.id, hr.numero_remision, hr.fecha_carga, hr.proveedor,
        (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id AND revision_pendiente = 2) as items_pendientes
        FROM historial_remisiones hr
        WHERE EXISTS (
            SELECT 1 FROM historial_items 
            WHERE remision_id = hr.id AND revision_pendiente = 2
        )
        ORDER BY hr.fecha_carga DESC";

$stmt = $pdo->query($sql);
$pendientes = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>

<script>window.userRol = '<?= $rol ?>';</script>

<div class="flex flex-col lg:flex-row h-[calc(100vh-1rem)] bg-base-200 font-sans">
    
    <div class="w-full lg:w-80 bg-white border-r border-base-300 flex flex-col z-20 flex-shrink-0 h-auto lg:h-full max-h-[30vh] lg:max-h-none overflow-hidden">
        <div class="p-4 border-b border-base-300 bg-base-100">
            <h2 class="font-bold text-lg text-gray-800 flex items-center gap-2">
                <i class="bi bi-exclamation-octagon text-error"></i> Incidencias
            </h2>
            <p class="text-xs text-gray-500 mt-1">Productos rechazados</p>
        </div>
        
        <div class="flex-grow overflow-y-auto p-2 space-y-2 custom-scrollbar">
            <?php if (empty($pendientes)): ?>
                <div class="flex flex-col items-center justify-center h-40 lg:h-64 text-gray-400 opacity-50">
                    <i class="bi bi-shield-check text-4xl mb-2 text-success"></i>
                    <p class="text-sm font-medium">Sin incidencias</p>
                </div>
            <?php endif; ?>

            <?php foreach ($pendientes as $p): ?>
                <div class="card bg-base-100 border border-base-200 hover:border-error cursor-pointer group transition-all shadow-sm"
                     onclick="DevolucionesAPI.cargarItems(<?= $p['id'] ?>, '<?= $p['numero_remision'] ?>')">
                    <div class="card-body p-3 lg:p-4">
                        <div class="flex justify-between items-start">
                            <h3 class="font-bold text-gray-700 text-sm lg:text-base"># <?= htmlspecialchars($p['numero_remision']) ?></h3>
                            <span class="badge badge-error text-white font-bold text-xs">
                                <?= $p['items_pendientes'] ?>
                            </span>
                        </div>
                        <p class="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <i class="bi bi-clock"></i> <?= fecha_espanol($p['fecha_carga']) ?>
                        </p>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>

    <div class="flex-grow flex flex-col bg-base-200 relative overflow-hidden h-full">
        <div class="navbar bg-white shadow-sm px-4 lg:px-6 border-b border-base-300 min-h-[4rem] flex justify-between items-center z-10">
            <div id="headerInfo" class="opacity-0 transition-opacity duration-300 flex flex-col">
                <div class="flex items-center gap-2">
                    <h1 class="font-black text-xl lg:text-2xl text-gray-800 leading-none" id="lblFolio">---</h1>
                    <div class="badge badge-ghost text-[10px] lg:text-xs uppercase tracking-widest font-bold text-error">
                        Re-conteo Físico
                    </div>
                </div>
            </div>
            
            <div id="headerActions" class="opacity-0 transition-opacity duration-300 flex gap-2">
                <button class="btn btn-sm btn-ghost text-gray-500" onclick="DevolucionesAPI.limpiarVista()">
                    <span class="hidden lg:inline">Cerrar</span> <i class="bi bi-x-lg lg:hidden"></i>
                </button>
                <?php if($rol === 'admin'): ?>
                <button class="btn btn-sm btn-success text-white shadow-md gap-2" onclick="DevolucionesAPI.finalizarRevision()">
                    <span class="hidden lg:inline">Terminar</span> <i class="bi bi-check2-all"></i>
                </button>
                <?php endif; ?>
            </div>
        </div>

        <div class="flex-grow overflow-y-auto p-4 lg:p-6" id="mainContainer">
            <div class="flex flex-col items-center justify-center h-full text-gray-400 opacity-40">
                <i class="bi bi-search text-6xl lg:text-7xl mb-4"></i>
                <p class="font-bold text-lg">Selecciona un folio</p>
            </div>
        </div>
    </div>
</div>

<script>
(() => {
    let currentRemisionId = 0;

    window.DevolucionesAPI = {
        init: () => { console.log('Modulo Incidencias (Status 2)'); },

        cargarItems: (id, folio) => {
            currentRemisionId = id;
            document.getElementById('lblFolio').innerText = '# ' + folio;
            document.getElementById('headerInfo').classList.remove('opacity-0');
            document.getElementById('headerActions').classList.remove('opacity-0');
            
            const container = document.getElementById('mainContainer');
            container.innerHTML = '<div class="flex justify-center items-center h-full"><span class="loading loading-dots loading-lg text-error"></span></div>';

            fetch('api/api_leer_faltantes.php?id=' + id + '&t=' + Date.now())
            .then(r => r.json())
            .then(data => {
                if(data.success) {
                    DevolucionesAPI.renderizar(data.items);
                } else {
                    container.innerHTML = `<div class="alert alert-error max-w-md mx-auto">${data.error}</div>`;
                }
            })
            .catch(err => container.innerHTML = `<div class="alert alert-error">Error de red</div>`);
        },

        renderizar: (items) => {
            const container = document.getElementById('mainContainer');
            const esAdmin = (window.userRol === 'admin');
            
            if(items.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full animate-fade-in">
                        <div class="w-16 h-16 bg-success rounded-full flex items-center justify-center text-white shadow-xl mb-4">
                            <i class="bi bi-check-lg text-4xl"></i>
                        </div>
                        <h2 class="text-2xl font-bold text-gray-700">Incidencias Resueltas</h2>
                    </div>`;
                setTimeout(() => location.reload(), 1500); 
                return;
            }

            let htmlParts = ['<div class="space-y-3 max-w-4xl mx-auto pb-20">'];
            
            items.forEach(item => {
                let fisico = parseFloat(item.existencia_lapiz); 
                // Si es 0, mostramos vacío. Si tiene valor, lo mostramos.
                let inputValue = (fisico > 0) ? fisico : '';
                
                // Botón CHECK (Validar) solo para Admin
                let btnValidar = '';
                if (esAdmin) {
                    btnValidar = `
                    <div class="flex flex-col justify-center border-l border-gray-200 pl-2 lg:pl-4">
                        <button class="btn btn-square btn-success text-white shadow-md tooltip tooltip-left" data-tip="Aceptar Corrección"
                                onclick="DevolucionesAPI.validarItem(${item.id})">
                            <i class="bi bi-check-lg text-2xl"></i>
                        </button>
                    </div>`;
                }

                // Botón GUARDAR (Disquete)
                let btnGuardar = `
                <div class="flex flex-col justify-center"> 
                    <button class="btn btn-square ${esAdmin ? 'btn-sm btn-ghost text-gray-400' : 'btn-lg btn-ghost border-2 border-base-200 text-primary'} hover:bg-primary hover:text-white transition-all" 
                            onclick="DevolucionesAPI.guardarConteo(${item.id})" 
                            title="Guardar Dato">
                        <i class="bi ${esAdmin ? 'bi-pencil' : 'bi-save text-2xl'}"></i>
                    </button>
                </div>`;

                htmlParts.push(`
                <div class="card bg-white border border-base-200 shadow-sm hover:shadow-md transition-all duration-300">
                    <div class="card-body p-4 flex flex-col md:flex-row items-center gap-4 md:gap-6">
                        
                        <div class="flex-grow w-full md:w-auto text-center md:text-left">
                            <div class="badge badge-ghost text-gray-400 font-bold text-[10px] mb-1 uppercase tracking-widest">
                                Verificar Cantidad
                            </div>
                            <h3 class="font-bold text-gray-800 text-base md:text-lg leading-tight mb-1">${item.descripcion_original}</h3>
                            <span class="badge badge-outline font-mono text-xs text-gray-400">${item.codigo_proveedor}</span>
                        </div>

                        <div class="flex items-stretch gap-2 w-full md:w-auto justify-center">
                            <div class="relative w-full md:w-48 border border-gray-300 rounded-xl overflow-hidden shadow-inner bg-white">
                                <span class="absolute top-1 left-0 w-full text-center text-[8px] font-bold text-gray-300 uppercase tracking-widest z-10 pointer-events-none">
                                    CONTEO FÍSICO
                                </span>
                                <input type="number" id="inp_verify_${item.id}" value="${inputValue}" placeholder="?"
                                       class="input input-ghost w-full h-16 text-center font-black text-3xl md:text-4xl text-primary focus:bg-base-50 p-0 focus:outline-none" 
                                       onkeypress="if(event.key === 'Enter') DevolucionesAPI.guardarConteo(${item.id})"
                                       onfocus="this.select()">
                            </div>
                            ${ !esAdmin ? btnGuardar : '' }
                            ${ esAdmin ? btnGuardar : '' }
                            ${ btnValidar } 
                        </div>
                    </div>
                </div>`);
            });

            htmlParts.push('</div>');
            container.innerHTML = htmlParts.join('');
        },

        guardarConteo: (idItem) => {
            const input = document.getElementById('inp_verify_' + idItem);
            const nuevoValor = parseFloat(input.value);

            if(isNaN(nuevoValor) || input.value === '') { 
                Swal.fire({toast:true, position:'top', icon:'warning', title:'Escribe la cantidad', showConfirmButton:false, timer:1000});
                return; 
            }

            input.disabled = true;
            let fd = new FormData();
            fd.append('id_item', idItem);
            fd.append('nuevo_valor', nuevoValor);

            fetch('api/api_recontar_item.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(data => {
                input.disabled = false;
                if(data.success) {
                    const Toast = Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 1500});
                    Toast.fire({icon: 'success', title: 'Guardado'});
                    if(window.userRol !== 'admin') {
                        input.value = ''; 
                        input.focus();
                    }
                } else {
                    Swal.fire('Error', data.error, 'error');
                }
            })
            .catch(() => { input.disabled = false; });
        },

        validarItem: (idItem) => {
            let fd = new FormData();
            fd.append('id_item', idItem);
            
            fetch('api/api_validar_item.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(data => {
                if(data.success) {
                    DevolucionesAPI.cargarItems(currentRemisionId, document.getElementById('lblFolio').innerText.replace('# ', ''));
                } else {
                    Swal.fire('Error', data.error, 'error');
                }
            });
        },

        finalizarRevision: () => {
            Swal.fire({
                title: '¿Concluir?',
                text: "Se generará el reporte de incidencias.",
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Sí, generar'
            }).then((result) => {
                if (result.isConfirmed) {
                    let ifr = document.createElement('iframe'); ifr.style.display='none'; document.body.appendChild(ifr);
                    let form = document.createElement("form"); form.target = ifr.name = 'dl_reclamo_' + Date.now(); 
                    form.method = "POST"; form.action = "api/generar_sicar_final.php"; 
                    let inp = document.createElement("input"); inp.type="hidden"; inp.name="remision_id"; inp.value=currentRemisionId;
                    form.appendChild(inp); document.body.appendChild(form); form.submit();
                    setTimeout(() => { document.body.removeChild(ifr); document.body.removeChild(form); }, 3000);
                }
            });
        },

        limpiarVista: () => {
            document.getElementById('headerInfo').classList.add('opacity-0');
            document.getElementById('headerActions').classList.add('opacity-0');
            document.getElementById('mainContainer').innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-400 opacity-40">
                    <i class="bi bi-search text-7xl mb-4"></i>
                    <p class="font-bold text-lg">Selecciona una tarea</p>
                </div>`;
        }
    };

    DevolucionesAPI.init();
})();
</script>