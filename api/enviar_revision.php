<?php
// api/enviar_revision.php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

if (!isset($_POST['remision_id']) || !isset($_POST['items'])) {
    echo json_encode(['success' => false, 'error' => 'Faltan datos']);
    exit;
}

$remision_texto = $_POST['remision_id'];
$items = $_POST['items'];

try {
    $pdo->beginTransaction();

    $stmtId = $pdo->prepare("SELECT id FROM historial_remisiones WHERE numero_remision = ? LIMIT 1");
    $stmtId->execute([$remision_texto]);
    $id_remision = $stmtId->fetchColumn();

    if (!$id_remision) throw new Exception("Remisión no encontrada");

    $sql = "UPDATE historial_items 
            SET existencia_lapiz = :fisico, 
                clave_final = :clave, 
                cantidad = :cant_real,
                estado_item = :estado,
                es_paquete = :es_paq,
                piezas_por_paquete = :pzas,
                aplica_iva = :iva,
                aplica_descuento = :desc
            WHERE remision_id = :rem_id AND codigo_proveedor = :cod_prov";
    
    $stmtUpdate = $pdo->prepare($sql);

    foreach ($items as $item) {
        $codProv = $item['cod_prov'];
        $fisico  = floatval($item['exis_lapiz'] ?? 0);
        $cantReal = floatval($item['cantidad_real'] ?? 0);
        $clave   = trim($item['clave_final'] ?? '');
        
        // Banderas (1 o 0)
        $esPaquete = intval($item['es_paquete'] ?? 0);
        $piezasPorPaquete = floatval($item['piezas_por_paquete'] ?? 1);
        $aplicaIva = intval($item['aplica_iva'] ?? 1);
        $aplicaDesc = intval($item['aplica_descuento'] ?? 1);

        // Lógica de Validación Faltantes
        // Total esperado = (Si es caja, Factura * Piezas). (Si es pieza, Factura).
        $totalEsperado = ($esPaquete == 1) ? ($cantReal * $piezasPorPaquete) : $cantReal;
        
        $diferencia = abs($fisico - $totalEsperado);
        $estadoItem = ($diferencia > 0.5) ? 'REVISION' : 'OK';
        $claveBD = (empty($clave) || $clave === 'undefined') ? null : $clave;

        $stmtUpdate->execute([
            ':fisico'    => $fisico,
            ':clave'     => $claveBD,
            ':cant_real' => $cantReal,
            ':estado'    => $estadoItem,
            ':es_paq'    => $esPaquete,
            ':pzas'      => $piezasPorPaquete,
            ':iva'       => $aplicaIva,
            ':desc'      => $aplicaDesc,
            ':rem_id'    => $id_remision,
            ':cod_prov'  => $codProv
        ]);
    }

    // Solo actualizamos estado si no se pidió finalizar explícitamente
    if (!isset($_POST['estado'])) {
        $stmtEstado = $pdo->prepare("UPDATE historial_remisiones SET estado = 'ENVIADO' WHERE id = ?");
        $stmtEstado->execute([$id_remision]);
    }

    $pdo->commit();
    echo json_encode(['success' => true]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>