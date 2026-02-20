<?php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

// SEGURIDAD: Solo admin
if (!isset($_SESSION['rol']) || $_SESSION['rol'] !== 'admin') {
    echo json_encode([]);
    exit;
}

try {
    // CORRECCIÓN: Quitamos 'ultimo_acceso' y agregamos 'activo'
    // Solo traemos los usuarios que tengan activo = 1
    $sql = "SELECT id, nombre, usuario, rol FROM usuarios WHERE activo = 1 ORDER BY nombre ASC";

    $stmt = $pdo->query($sql);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

} catch (Exception $e) {
    // Enviar array vacío en caso de error para que no rompa el JS
    echo json_encode([]);
}
?>