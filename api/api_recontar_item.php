<?php
// api/api_recontar_item.php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método inválido']);
    exit;
}

$id_item = $_POST['id_item'] ?? 0;
$nuevo_valor = $_POST['nuevo_valor'] ?? 0; // Puede ser 0 si realmente no hay nada

try {
    // Actualizamos SOLO la existencia física
    $stmt = $pdo->prepare("UPDATE historial_items SET existencia_lapiz = ? WHERE id = ?");
    $stmt->execute([$nuevo_valor, $id_item]);

    echo json_encode(['success' => true]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>