<?php
// api/api_importar_catalogo.php
session_start();
require_once '../config/db.php';

// Configuración para archivos grandes
ini_set('memory_limit', '512M');
set_time_limit(300);
header('Content-Type: application/json'); // Importante para que JS lo entienda

if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_FILES['archivo_sicar'])) {
    
    $archivo = $_FILES['archivo_sicar']['tmp_name'];
    
    if (!is_uploaded_file($archivo)) {
        echo json_encode(['success' => false, 'error' => 'Error al subir el archivo']);
        exit;
    }

    try {
        $pdo->beginTransaction();
        
        $handle = fopen($archivo, "r");
        
        // --- 1. DETECCIÓN INTELIGENTE DE ENCABEZADOS ---
        // En lugar de saltar 5 líneas fijas, leemos hasta encontrar la fila de títulos
        
        $indices = [];
        $encontroEncabezados = false;
        
        // Leemos las primeras 20 líneas buscando palabras clave
        for ($k = 0; $k < 20; $k++) {
            $fila = fgetcsv($handle, 1000, ",");
            if ($fila === FALSE) break;

            // Convertimos toda la fila a minúsculas para comparar fácil
            $filaLower = array_map('strtolower', $fila);

            // Buscamos columnas clave
            if (in_array('clave', $filaLower) || in_array('descripcion', $filaLower)) {
                // ¡Encontramos los encabezados! Guardamos sus posiciones
                $indices['clave']  = array_search('clave', $filaLower);
                $indices['desc']   = array_search('descripcion', $filaLower);
                
                // Buscamos variaciones de nombres
                $indices['precioV'] = false;
                foreach($filaLower as $idx => $val) {
                    if(strpos($val, 'precio') !== false && strpos($val, 'venta') !== false) $indices['precioV'] = $idx; // Precio Venta
                    elseif(strpos($val, 'precio') !== false && strpos($val, '1') !== false) $indices['precioV'] = $idx; // Precio 1
                }
                // Si no halló específico, busca cualquiera que diga precio
                if($indices['precioV'] === false) $indices['precioV'] = array_search('precio', $filaLower);


                $indices['precioC'] = false;
                foreach($filaLower as $idx => $val) {
                    if(strpos($val, 'costo') !== false) $indices['precioC'] = $idx;
                    elseif(strpos($val, 'compra') !== false) $indices['precioC'] = $idx;
                }

                $indices['exis'] = array_search('existencia', $filaLower);
                
                $encontroEncabezados = true;
                break; // Dejamos de buscar headers y pasamos a los datos
            }
        }

        // Si no encontró encabezados, usamos los índices por defecto de tu código anterior (Plan B)
        if (!$encontroEncabezados) {
            // Rebobinamos y saltamos las 5 líneas manuales como antes
            rewind($handle);
            for ($i = 0; $i < 5; $i++) fgetcsv($handle);
            
            $indices = [
                'clave' => 0,
                'desc' => 1,
                'precioV' => 4,
                'precioC' => 5,
                'exis' => 8
            ];
        }

        // --- 2. PREPARAR SQL ---
        $sql = "INSERT INTO cat_productos (clave_sicar, descripcion, codigo_barras, precio_compra, precio_venta, existencia, fecha_actualizacion) 
                VALUES (?, ?, ?, ?, ?, ?, NOW()) 
                ON DUPLICATE KEY UPDATE 
                descripcion = VALUES(descripcion),
                precio_compra = VALUES(precio_compra),
                precio_venta = VALUES(precio_venta),
                existencia = VALUES(existencia),
                fecha_actualizacion = NOW()";

        $stmt = $pdo->prepare($sql);
        $insertados = 0;
        
        // --- 3. PROCESAR DATOS ---
        while (($datos = fgetcsv($handle, 1000, ",")) !== FALSE) {
            
            // Obtenemos datos usando los índices detectados (o los por defecto)
            $clave = trim($datos[$indices['clave']] ?? '');
            if (empty($clave)) continue;

            $descRaw = $datos[$indices['desc']] ?? '';
            // Codificación segura para acentos (mejor que utf8_encode)
            $descripcion = mb_convert_encoding($descRaw, 'UTF-8', 'auto');

            // Limpieza de números
            $pV = $datos[$indices['precioV']] ?? 0;
            $pC = $datos[$indices['precioC']] ?? 0;
            $ex = $datos[$indices['exis']] ?? 0;

            $precioVenta  = floatval(str_replace(['$', ',', ' '], '', $pV));
            $precioCompra = floatval(str_replace(['$', ',', ' '], '', $pC));
            $existencia   = floatval(str_replace(['$', ',', ' '], '', $ex));

            // Ejecutar
            $stmt->execute([
                $clave, 
                $descripcion, 
                $clave, // Usamos clave como código de barras
                $precioCompra, 
                $precioVenta, 
                $existencia
            ]);
            $insertados++;
        }

        $pdo->commit();
        fclose($handle);

        // RESPUESTA JSON PARA EL FRONTEND
        echo json_encode([
            'success' => true, 
            'insertados' => $insertados,
            'mensaje' => 'Catálogo actualizado correctamente'
        ]);

    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }

} else {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
?>