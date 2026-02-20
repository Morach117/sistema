<?php
// api/api_leer_faltantes.php
require_once '../config/db.php';
header('Content-Type: application/json');

$id = $_GET['id'] ?? 0;

try {
    // CAMBIO: Buscamos revision_pendiente = 2
    $sql = "SELECT id, codigo_proveedor, descripcion_original, cantidad, existencia_lapiz, costo_unitario 
            FROM historial_items 
            WHERE remision_id = ? AND revision_pendiente = 2
            ORDER BY descripcion_original ASC";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['success' => true, 'items' => $items]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>