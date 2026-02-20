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
    $procesados = 0;

    foreach ($archivos as $archivo) {
        if ($archivo['error'] !== UPLOAD_ERR_OK) continue;

        $rutaTmp = $archivo['tmp_name'];
        $ext = strtolower(pathinfo($archivo['name'], PATHINFO_EXTENSION));

        if ($ext === 'xml') {
            procesarXML($rutaTmp, $pdo);
        } else {
            procesarCSV($rutaTmp, $pdo);
        }
        $procesados++;
    }

    if ($procesados === 0) throw new Exception("No se procesó ningún archivo válido.");

    $pdo->commit();
    echo json_encode(['success' => true, 'mensaje' => "Se cargaron $procesados archivos correctamente."]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

function procesarXML($ruta, $pdo) {
    $content = file_get_contents($ruta);
    $xml = simplexml_load_string($content);
    $xml->registerXPathNamespace('cfdi', 'http://www.sat.gob.mx/cfd/4');

    $serie = (string)$xml['Serie'];
    $folio = (string)$xml['Folio'];
    $folioCompleto = trim($serie . $folio);

    // Detectar Proveedor
    $emisor = $xml->xpath('//cfdi:Emisor')[0];
    $rfc = strtoupper((string)$emisor['Rfc']);
    $nombre = strtoupper((string)$emisor['Nombre']);
    
    $prov = 'MANUAL';
    
    if ($rfc === 'TTI961202IM1' || strpos($nombre, 'TONY') !== false) {
        $prov = 'TONY';
    } 
    elseif ($rfc === 'LOVM900722BD8' || strpos($nombre, 'PAOLA') !== false) {
        $prov = 'PAOLA';
    }
    // CORRECCIÓN RFC OPTIVOSA
    elseif ($rfc === 'OTV801119HU2' || strpos($nombre, 'OPERADORA DE TIENDAS') !== false) {
        $prov = 'OPTIVOSA';
    }
    elseif (strpos($nombre, 'OPTIVOSA') !== false) {
        $prov = 'OPTIVOSA';
    }

    $idRem = obtenerOcrearRemision($pdo, $folioCompleto, $prov);

    foreach ($xml->xpath('//cfdi:Concepto') as $c) {
        $cod = (string)$c['NoIdentificacion'];
        $desc = (string)$c['Descripcion'];
        $cant = (float)$c['Cantidad'];
        $costo = (float)$c['ValorUnitario'];

        // IVA Inteligente
        $traslados = $c->xpath('cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado');
        if ($traslados) {
            foreach ($traslados as $t) {
                $imp = (string)$t['Impuesto'];
                $tasa = (float)$t['TasaOCuota'];
                if ($imp === '002' && $tasa > 0) {
                    $costo *= (1 + $tasa);
                }
            }
        }

        // Bandera de Descuento en XML
        $montoDesc = isset($c['Descuento']) ? (float)$c['Descuento'] : 0;
        $traeDescuentoXML = ($montoDesc > 0) ? 1 : 0;

        $stmt = $pdo->prepare("INSERT INTO historial_items 
            (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) 
            VALUES (?, ?, ?, ?, ?, 0, 0, 1, 0, ?)");
        
        $stmt->execute([$idRem, $cod, $desc, $cant, $costo, $traeDescuentoXML]);
    }
}

function procesarCSV($ruta, $pdo) {
    $h = fopen($ruta, "r");
    $cacheRem = [];
    while (($r = fgetcsv($h, 1000, ",")) !== FALSE) {
        $r = array_map('trim', $r);
        if (empty($r[0]) || stripos($r[0], 'remision') !== false) continue;
        
        $remTxt = $r[0];
        if (!isset($cacheRem[$remTxt])) {
            $cacheRem[$remTxt] = obtenerOcrearRemision($pdo, $remTxt, 'MANUAL');
        }
        
        $desc = (!mb_check_encoding($r[2], 'UTF-8')) ? utf8_encode($r[2]) : $r[2];
        
        // CORRECCIÓN: Limpiar comas para evitar error en cantidades > 1,000
        $cantidad = floatval(str_replace(',', '', $r[3]));
        $costo = floatval(str_replace(['$', ','], '', $r[4]));
        $exis = isset($r[5]) ? floatval(str_replace(',', '', $r[5])) : 0;

        $pdo->prepare("INSERT INTO historial_items (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 0)")
            ->execute([$cacheRem[$remTxt], $r[1], $desc, $cantidad, $costo, $exis]);
    }
    fclose($h);
}

function obtenerOcrearRemision($pdo, $folio, $prov) {
    $stmt = $pdo->prepare("SELECT id FROM historial_remisiones WHERE numero_remision = ? LIMIT 1");
    $stmt->execute([$folio]);
    $id = $stmt->fetchColumn();
    if ($id) {
        $pdo->prepare("UPDATE historial_remisiones SET fecha_carga = NOW(), proveedor = ? WHERE id = ?")->execute([$prov, $id]);
        return $id;
    }
    $pdo->prepare("INSERT INTO historial_remisiones (numero_remision, proveedor, fecha_carga, estado) VALUES (?, ?, NOW(), 'PENDIENTE')")->execute([$folio, $prov]);
    return $pdo->lastInsertId();
}
?>