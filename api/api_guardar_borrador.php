<?php
// api/api_guardar_borrador.php
session_start();
require_once '../config/db.php';

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

header('Content-Type: application/json');

try {
    if (!isset($_FILES['archivo_factura'])) {
        throw new Exception("No se seleccionaron archivos.");
    }

    $archivos = [];
    if (is_array($_FILES['archivo_factura']['name'])) {
        $total = count($_FILES['archivo_factura']['name']);
        for ($i = 0; $i < $total; $i++) {
            $archivos[] = [
                'name' => $_FILES['archivo_factura']['name'][$i],
                'tmp_name' => $_FILES['archivo_factura']['tmp_name'][$i],
                'error' => $_FILES['archivo_factura']['error'][$i]
            ];
        }
    } else {
        $archivos[] = $_FILES['archivo_factura'];
    }

    $pdo->beginTransaction();

    // Variables para devolver al final
    $ultimoId = 0;
    $ultimoProv = 'MANUAL';

    foreach ($archivos as $archivo) {
        if ($archivo['error'] !== UPLOAD_ERR_OK)
            continue;

        $rutaTmp = $archivo['tmp_name'];
        $ext = strtolower(pathinfo($archivo['name'], PATHINFO_EXTENSION));

        $res = null;
        if ($ext === 'xml') {
            $res = procesarXML($rutaTmp, $pdo);
        } else {
            $res = procesarCSV($rutaTmp, $pdo);
        }

        if ($res) {
            $ultimoId = $res['id'];
            $ultimoProv = $res['prov'];
        }
    }

    $pdo->commit();

    // Devolvemos datos para que el JS actualice la vista sin recargar
    echo json_encode([
        'success' => true,
        'mensaje' => "Procesado correctamente.",
        'id_remision' => $ultimoId,
        'proveedor' => $ultimoProv
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction())
        $pdo->rollBack();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

function procesarXML($ruta, $pdo)
{
    $content = file_get_contents($ruta);
    $xml = simplexml_load_string($content);
    $xml->registerXPathNamespace('cfdi', 'http://www.sat.gob.mx/cfd/4');

    // Validación por si el XML omite estos atributos
    $serie = isset($xml['Serie']) ? (string) $xml['Serie'] : '';
    $folio = isset($xml['Folio']) ? (string) $xml['Folio'] : '';

    // --- CORRECCIÓN 1: Limpieza estricta del Folio (Solo letras y números) ---
    // Esto evita duplicados como "F-123" vs "F123"
    $folioCompleto = preg_replace('/[^A-Z0-9]/', '', strtoupper($serie . $folio));

    // Detección automática (Con validación por si falla la lectura)
    $emisores = $xml->xpath('//cfdi:Emisor');
    if (!$emisores) return null; 
    
    $emisor = $emisores[0];
    $rfc = strtoupper((string) $emisor['Rfc']);
    $nombre = strtoupper((string) $emisor['Nombre']);

    $prov = 'MANUAL';
    if ($rfc === 'TTI961202IM1' || strpos($nombre, 'TONY') !== false) {
        $prov = 'TONY';
    } elseif ($rfc === 'LOVM900722BD8' || strpos($nombre, 'PAOLA') !== false) {
        $prov = 'PAOLA';
    } elseif ($rfc === 'OTV801119HU2' || strpos($nombre, 'OPTIVOSA') !== false) {
        $prov = 'OPTIVOSA';
    } elseif (strpos($nombre, 'OPERADORA') !== false) {
        $prov = 'PAOLA';
    } 
    // NUEVO PROVEEDOR: GRUPO MEGAMER
    elseif ($rfc === 'GME191105I5A' || strpos($nombre, 'MEGAMER') !== false) {
        $prov = 'MEGAMER';
    }

    // Obtener ID (Upsert)
    $idRem = obtenerOcrearRemision($pdo, $folioCompleto, $prov);

    foreach ($xml->xpath('//cfdi:Concepto') as $c) {
        $cod = (string) $c['NoIdentificacion'];
        $desc = (string) $c['Descripcion'];
        $cant = (float) $c['Cantidad'];
        $costo = (float) $c['ValorUnitario'];

        // Búsqueda profunda de traslados (.//) para mayor compatibilidad
        $traslados = $c->xpath('.//cfdi:Traslado');
        if ($traslados) {
            foreach ($traslados as $t) {
                if ((string) $t['Impuesto'] === '002' && (float) $t['TasaOCuota'] > 0) {
                    $costo *= (1 + (float) $t['TasaOCuota']);
                }
            }
        }

        $montoDesc = isset($c['Descuento']) ? (float) $c['Descuento'] : 0;
        $traeDescuentoXML = ($montoDesc > 0) ? 1 : 0;

        // --- CORRECCIÓN 2: Sincronización Inteligente (No duplica items) ---
        $stmtCheck = $pdo->prepare("SELECT id FROM historial_items WHERE remision_id = ? AND codigo_proveedor = ? LIMIT 1");
        $stmtCheck->execute([$idRem, $cod]);
        $existe = $stmtCheck->fetchColumn();

        if ($existe) {
            // Si ya existe, actualizamos DATOS DE FACTURA, pero NO tocamos el conteo físico
            $sqlUpd = "UPDATE historial_items SET descripcion_original=?, cantidad=?, costo_unitario=?, aplica_descuento=? WHERE id=?";
            $pdo->prepare($sqlUpd)->execute([$desc, $cant, $costo, $traeDescuentoXML, $existe]);
        } else {
            // Si es nuevo, insertamos
            $sqlIns = "INSERT INTO historial_items (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) VALUES (?, ?, ?, ?, ?, 0, 0, 1, 0, ?)";
            $pdo->prepare($sqlIns)->execute([$idRem, $cod, $desc, $cant, $costo, $traeDescuentoXML]);
        }
    }

    return ['id' => $idRem, 'prov' => $prov];
}

function procesarCSV($ruta, $pdo)
{
    $h = fopen($ruta, "r");
    $cacheRem = [];
    $ultimoId = 0;

    while (($r = fgetcsv($h, 1000, ",")) !== FALSE) {
        $r = array_map('trim', $r);
        if (empty($r[0]) || stripos($r[0], 'remision') !== false)
            continue;

        // Limpieza de folio en CSV también
        $remTxt = preg_replace('/[^A-Z0-9]/', '', strtoupper($r[0]));

        if (!isset($cacheRem[$remTxt])) {
            $cacheRem[$remTxt] = obtenerOcrearRemision($pdo, $remTxt, 'MANUAL');
        }
        $idRem = $cacheRem[$remTxt];
        $ultimoId = $idRem;

        $cod = $r[1];
        $desc = (!mb_check_encoding($r[2], 'UTF-8')) ? utf8_encode($r[2]) : $r[2];
        $cantidad = floatval(str_replace(',', '', $r[3]));
        $costo = floatval(str_replace(['$', ','], '', $r[4]));
        $exis = isset($r[5]) ? floatval(str_replace(',', '', $r[5])) : 0;

        // Sincronización CSV
        $stmtCheck = $pdo->prepare("SELECT id FROM historial_items WHERE remision_id = ? AND codigo_proveedor = ? LIMIT 1");
        $stmtCheck->execute([$idRem, $cod]);
        $existe = $stmtCheck->fetchColumn();

        if ($existe) {
            $pdo->prepare("UPDATE historial_items SET descripcion_original=?, cantidad=?, costo_unitario=? WHERE id=?")->execute([$desc, $cantidad, $costo, $existe]);
        } else {
            $pdo->prepare("INSERT INTO historial_items (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 0)")->execute([$idRem, $cod, $desc, $cantidad, $costo, $exis]);
        }
    }
    fclose($h);
    return ['id' => $ultimoId, 'prov' => 'MANUAL'];
}

function obtenerOcrearRemision($pdo, $folio, $prov)
{
    $stmt = $pdo->prepare("SELECT id FROM historial_remisiones WHERE numero_remision = ? LIMIT 1");
    $stmt->execute([$folio]);
    $id = $stmt->fetchColumn();

    if ($id) {
        // Solo actualizamos fecha, NO creamos nueva
        $pdo->prepare("UPDATE historial_remisiones SET fecha_carga = NOW(), proveedor = ? WHERE id = ?")->execute([$prov, $id]);
        return $id;
    }

    $pdo->prepare("INSERT INTO historial_remisiones (numero_remision, proveedor, fecha_carga, estado) VALUES (?, ?, NOW(), 'PENDIENTE')")->execute([$folio, $prov]);
    return $pdo->lastInsertId();
}
?>