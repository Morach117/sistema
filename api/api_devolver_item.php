<?php
// api/api_devolver_item.php
require_once '../config/db.php';
header('Content-Type: application/json');

$id_item = $_POST['id_item'] ?? null;

if (!$id_item) {
    echo json_encode(['success' => false, 'error' => 'Falta ID']);
    exit;
}

try {
    // CAMBIO IMPORTANTE: Establecemos revision_pendiente = 2
    $stmt = $pdo->prepare("UPDATE historial_items SET existencia_lapiz = 0, revision_pendiente = 2 WHERE id = ?");
    $stmt->execute([$id_item]);

    echo json_encode(['success' => true]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>