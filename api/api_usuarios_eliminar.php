<?php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

if ($_SESSION['rol'] !== 'admin') {
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

$id = $_POST['id'];

if ($id == $_SESSION['user_id']) {
    echo json_encode(['success' => false, 'error' => 'No puedes eliminarte a ti mismo']);
    exit;
}

try {
    // CAMBIO: En lugar de DELETE, hacemos UPDATE activo = 0
    $stmt = $pdo->prepare("UPDATE usuarios SET activo = 0 WHERE id = ?");
    $stmt->execute([$id]);
    
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>