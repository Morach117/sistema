<?php
// views/modulo_importar_ventas.php
session_start();
require_once '../config/db.php';

$rol = $_SESSION['rol'] ?? 'empleado';
if ($rol !== 'admin') {
    die("<div class='p-10 flex flex-col items-center justify-center h-full'><h2 class='text-2xl font-black text-slate-700'>Acceso Denegado</h2></div>");
}

// =====================================================================
// API INTEGRADA: PROCESADOR DEL CSV DE SICAR
// =====================================================================
$accion = $_GET['accion'] ?? '';

if ($accion === 'subir_csv') {
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');

    if (!isset($_FILES['archivo_csv']) || $_FILES['archivo_csv']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'error' => 'No se subió ningún archivo o hubo un error.']);
        exit;
    }

    $file = $_FILES['archivo_csv']['tmp_name'];
    
    try {
        // 1. TRUNCATE hace auto-commit en MySQL, así que lo ejecutamos ANTES de abrir la transacción
        $pdo->exec("TRUNCATE TABLE estadisticas_ventas");
        
        // Iniciamos la transacción segura para la inserción masiva
        $pdo->beginTransaction();
        
        $handle = fopen($file, "r");
        if (!$handle) {
            throw new Exception("No se pudo leer el archivo CSV.");
        }

        $insertados = 0;
        
        // 2. NUEVA INSTRUCCIÓN A PRUEBA DE DUPLICADOS DE SICAR
        // Si el código ya existe, sumamos la cantidad para no perder las ventas repetidas
        $stmt = $pdo->prepare("
            INSERT INTO estadisticas_ventas (clave_sicar, cantidad_vendida) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE cantidad_vendida = cantidad_vendida + VALUES(cantidad_vendida)
        ");

        while (($line = fgetcsv($handle, 10000, ",")) !== FALSE) {
            $clave = trim($line[0]);

            // 3. Filtro inteligente para ignorar la basura de los encabezados de SICAR
            $palabras_ignoradas = ['Reporte', 'Documento', 'Cliente', 'Depto', 'Clave'];
            $omitir = false;
            
            if (empty($clave)) continue;
            
            foreach ($palabras_ignoradas as $pi) {
                if (stripos($clave, $pi) !== false) {
                    $omitir = true; break;
                }
            }
            if ($omitir) continue;

            // 4. Limpiamos las celdas vacías (las comas múltiples del CSV)
            $celdas_validas = array_filter($line, function($val) {
                return trim($val) !== '';
            });

            // 5. Extraemos el último dato (que debe ser la cantidad)
            if (count($celdas_validas) >= 2) {
                $cantidadStr = trim(end($celdas_validas));
                // SICAR a veces exporta miles con coma (ej. 1,000.00), la quitamos
                $cantidadStr = str_replace(',', '', $cantidadStr); 
                $cantidad = floatval($cantidadStr);

                if ($cantidad > 0) {
                    $stmt->execute([$clave, $cantidad]);
                    $insertados++;
                }
            }
        }
        fclose($handle);
        $pdo->commit(); // Confirmamos los cambios
        
        echo json_encode(['success' => true, 'message' => "¡Éxito! Se procesaron $insertados registros de ventas (los duplicados fueron sumados automáticamente)."]);
    } catch (Exception $e) {
        // Validamos si la transacción sigue activa antes de intentar hacer el rollBack
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo json_encode(['success' => false, 'error' => "Error al procesar: " . $e->getMessage()]);
    }
    exit;
}
// =====================================================================
?>

<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
    #modulo-importador { font-family: 'Plus Jakarta Sans', sans-serif; }
    .glass-panel { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6); }
    .drag-active { border-color: #10b981 !important; background-color: #ecfdf5 !important; }
</style>

<div id="modulo-importador" class="h-full overflow-y-auto p-4 md:p-8 bg-slate-50">
    
    <div class="mb-8">
        <h1 class="text-3xl font-black text-slate-800 flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <i class="bi bi-cloud-arrow-up-fill text-white text-xl"></i>
            </div>
            Alimentar Inteligencia Artificial
        </h1>
        <p class="text-slate-500 font-bold mt-2">Sube el reporte de ventas de SICAR (.csv) para que el asistente de compras te sugiera qué pedir.</p>
    </div>

    <div class="max-w-2xl mx-auto glass-panel p-8 rounded-3xl shadow-xl">
        
        <div class="mb-6 flex gap-4 text-sm bg-blue-50 text-blue-700 p-4 rounded-xl border border-blue-100">
            <i class="bi bi-info-circle-fill text-xl"></i>
            <div>
                <strong>Instrucciones:</strong> En SICAR, ve a Reportes > Artículos Vendidos. Exporta el reporte, ábrelo en Excel, guárdalo como <strong>CSV (delimitado por comas)</strong> y súbelo aquí. El sistema limpiará los encabezados automáticamente y sumará los productos repetidos.
            </div>
        </div>

        <form id="formImportar" onsubmit="ImportadorAPI.subirArchivo(event)">
            <div id="dropZone" class="border-4 border-dashed border-slate-300 rounded-3xl p-10 text-center cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-all relative group" onclick="document.getElementById('inputCsv').click()">
                <i class="bi bi-filetype-csv text-6xl text-slate-300 group-hover:text-indigo-500 transition-colors mb-4 block"></i>
                <h3 class="text-lg font-black text-slate-700 mb-1" id="dropText">Haz clic para seleccionar tu archivo CSV</h3>
                <p class="text-sm text-slate-400 font-bold">o arrástralo y suéltalo aquí</p>
                <input type="file" id="inputCsv" accept=".csv" class="hidden" onchange="ImportadorAPI.archivoSeleccionado()">
            </div>

            <div class="mt-8 flex justify-end">
                <button type="submit" id="btnSubir" disabled class="h-14 px-8 rounded-2xl font-black text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-lg flex items-center gap-2">
                    <i class="bi bi-rocket-takeoff-fill"></i> PROCESAR VENTAS
                </button>
            </div>
        </form>

    </div>
</div>

<script>
(() => {
    const dropZone = document.getElementById('dropZone');
    const inputCsv = document.getElementById('inputCsv');
    const dropText = document.getElementById('dropText');
    const btnSubir = document.getElementById('btnSubir');

    // Efectos de Arrastrar y Soltar
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        let dt = e.dataTransfer;
        let files = dt.files;
        inputCsv.files = files;
        window.ImportadorAPI.archivoSeleccionado();
    });

    window.ImportadorAPI = {
        archivoSeleccionado: () => {
            if (inputCsv.files.length > 0) {
                const archivo = inputCsv.files[0];
                if(archivo.name.endsWith('.csv')) {
                    dropText.innerHTML = `<span class="text-indigo-600"><i class="bi bi-check-circle-fill"></i> ${archivo.name}</span>`;
                    btnSubir.disabled = false;
                } else {
                    Swal.fire('Formato incorrecto', 'Por favor, selecciona un archivo terminado en .csv', 'error');
                    inputCsv.value = '';
                    btnSubir.disabled = true;
                    dropText.innerText = 'Haz clic para seleccionar tu archivo CSV';
                }
            }
        },

        subirArchivo: (e) => {
            e.preventDefault();
            if (inputCsv.files.length === 0) return;

            const formData = new FormData();
            formData.append('archivo_csv', inputCsv.files[0]);

            btnSubir.disabled = true;
            btnSubir.innerHTML = '<span class="loading loading-spinner loading-md"></span> Procesando miles de filas...';

            fetch('views/modulo_importar_ventas.php?accion=subir_csv', {
                method: 'POST',
                body: formData
            })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    Swal.fire({
                        title: '¡Base de Datos Actualizada!',
                        text: res.message,
                        icon: 'success',
                        confirmButtonColor: '#4f46e5'
                    }).then(() => {
                        // Lo mandamos directo a probar el Asistente de Expo
                        window.cargarVista('modulo_expo_compras');
                    });
                } else {
                    Swal.fire('Error', res.error, 'error');
                    btnSubir.disabled = false;
                    btnSubir.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> PROCESAR VENTAS';
                }
            })
            .catch(err => {
                Swal.fire('Error', 'Hubo un problema de red.', 'error');
                btnSubir.disabled = false;
                btnSubir.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> PROCESAR VENTAS';
            });
        }
    };
})();
</script>