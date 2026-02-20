<?php
// api/api_validar_item.php
require_once '../config/db.php';
header('Content-Type: application/json');

$id = $_POST['id_item'] ?? 0;

try {
    // Al poner revision_pendiente en 0, desaparece de la lista de "Faltantes"
    $stmt = $pdo->prepare("UPDATE historial_items SET revision_pendiente = 0 WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>