<?php
// api/eliminar_remision.php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

if (!isset($_SESSION['rol']) || $_SESSION['rol'] !== 'admin') {
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

$id = $_POST['id'] ?? 0;

try {
    $pdo->beginTransaction();

    // 1. Eliminar items
    $stmtItems = $pdo->prepare("DELETE FROM historial_items WHERE remision_id = ?");
    $stmtItems->execute([$id]);

    // 2. Eliminar cabecera
    $stmtHead = $pdo->prepare("DELETE FROM historial_remisiones WHERE id = ?");
    $stmtHead->execute([$id]);

    $pdo->commit();
    echo json_encode(['success' => true]);

} catch (Exception $e) {
    if($pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>