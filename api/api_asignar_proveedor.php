<?php
// api/api_asignar_proveedor.php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || ($_SESSION['rol'] ?? '') !== 'admin') {
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

$id_remision = $_POST['id_remision'] ?? null;
$proveedor = $_POST['proveedor'] ?? null;

if (!$id_remision || !$proveedor) {
    echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
    exit;
}

try {
    // Convertir el valor del select (minúsculas) al formato de la BD (Mayúsculas)
    $provBD = 'MANUAL';
    if ($proveedor === 'paola') $provBD = 'PAOLA';
    elseif ($proveedor === 'tony') $provBD = 'TONY';
    elseif ($proveedor === 'optivosa') $provBD = 'OPTIVOSA';

    $stmt = $pdo->prepare("UPDATE historial_remisiones SET proveedor = ? WHERE id = ?");
    $stmt->execute([$provBD, $id_remision]);

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>