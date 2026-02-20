<?php
// api/finalizar_remision.php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

if (!isset($_POST['remision_id'])) {
    echo json_encode(['success' => false, 'error' => 'No se recibió ID']);
    exit;
}

$remision_texto = $_POST['remision_id'];

try {
    $pdo->beginTransaction();

    $stmtId = $pdo->prepare("SELECT id FROM historial_remisiones WHERE numero_remision = ? LIMIT 1");
    $stmtId->execute([$remision_texto]);
    $id_remision = $stmtId->fetchColumn();

    if (!$id_remision) throw new Exception("Remisión no encontrada");

    // 1. Guardar última versión
    if (isset($_POST['items']) && is_array($_POST['items'])) {
        $sqlUpd = "UPDATE historial_items 
                   SET existencia_lapiz = :fisico, clave_final = :clave, cantidad = :cant_real,
                       estado_item = :estado, es_paquete = :es_paq, piezas_por_paquete = :pzas,
                       aplica_iva = :iva, aplica_descuento = :desc
                   WHERE remision_id = :rem_id AND codigo_proveedor = :cod_prov";
        $stmtUpd = $pdo->prepare($sqlUpd);

        foreach ($_POST['items'] as $item) {
            $codProv = $item['cod_prov'];
            $fisico  = floatval($item['exis_lapiz'] ?? 0);
            $cantReal = floatval($item['cantidad_real'] ?? 0);
            $clave   = trim($item['clave_final'] ?? '');
            $esPaquete = intval($item['es_paquete'] ?? 0);
            $piezasPorPaquete = floatval($item['piezas_por_paquete'] ?? 1);
            $aplicaIva = intval($item['aplica_iva'] ?? 1);
            $aplicaDesc = intval($item['aplica_descuento'] ?? 1);

            // Validación (Tolerancia simple)
            // Si es caja, la validación se hace contra (Factura / Piezas). Si es suelto, directo.
            $esperado = $esPaquete ? ($cantReal / $piezasPorPaquete) : $cantReal;
            $estadoItem = (abs($fisico - $esperado) > 0.1) ? 'REVISION' : 'OK';
            $claveBD = (empty($clave)) ? null : $clave;

            $stmtUpd->execute([
                ':fisico' => $fisico, ':clave' => $claveBD, ':cant_real' => $cantReal,
                ':estado' => $estadoItem, ':es_paq' => $esPaquete, ':pzas' => $piezasPorPaquete,
                ':iva' => $aplicaIva, ':desc' => $aplicaDesc, ':rem_id' => $id_remision, ':cod_prov' => $codProv
            ]);
        }
    }

    // 2. APRENDER (Memoria)
    $sqlLearn = "SELECT codigo_proveedor, clave_final, costo_unitario, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento 
                 FROM historial_items WHERE remision_id = ? AND clave_final IS NOT NULL";
    $stmtLearn = $pdo->prepare($sqlLearn);
    $stmtLearn->execute([$id_remision]);
    $itemsAprendidos = $stmtLearn->fetchAll(PDO::FETCH_ASSOC);

    $sqlInsertMemoria = "INSERT INTO rel_codigos_proveedor 
                        (codigo_proveedor, clave_sicar, ultimo_costo, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento, nombre_proveedor, fecha_actualizacion) 
                        VALUES (:cod, :sicar, :costo, :es_paq, :pzas, :iva, :desc, 'GENERICO', NOW())
                        ON DUPLICATE KEY UPDATE 
                        clave_sicar = VALUES(clave_sicar), ultimo_costo = VALUES(ultimo_costo), 
                        es_paquete = VALUES(es_paquete), piezas_por_paquete = VALUES(piezas_por_paquete),
                        aplica_iva = VALUES(aplica_iva), aplica_descuento = VALUES(aplica_descuento),
                        fecha_actualizacion = NOW()";
    
    $stmtMemoria = $pdo->prepare($sqlInsertMemoria);

    foreach ($itemsAprendidos as $item) {
        $stmtMemoria->execute([
            ':cod'   => $item['codigo_proveedor'],
            ':sicar' => $item['clave_final'],
            ':costo' => $item['costo_unitario'],
            ':es_paq'=> $item['es_paquete'],
            ':pzas'  => $item['piezas_por_paquete'],
            ':iva'   => $item['aplica_iva'],
            ':desc'  => $item['aplica_descuento']
        ]);
    }

    // 3. Finalizar
    $pdo->prepare("UPDATE historial_remisiones SET estado = 'FINALIZADO' WHERE id = ?")->execute([$id_remision]);
    $pdo->commit();
    echo json_encode(['success' => true]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>