<?php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

if ($_SESSION['rol'] !== 'admin') {
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

$id = $_POST['id'] ?? '';
$nombre = $_POST['nombre'];
$usuario = $_POST['usuario'];
$rol = $_POST['rol'];
$pass = $_POST['password'];

try {
    if (empty($id)) {
        // CREAR NUEVO
        if (empty($pass)) throw new Exception("La contraseña es obligatoria para nuevos usuarios");
        
        $hash = password_hash($pass, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)");
        $stmt->execute([$nombre, $usuario, $hash, $rol]);
        
    } else {
        // EDITAR EXISTENTE
        if (!empty($pass)) {
            // Si escribió contraseña, la actualizamos
            $hash = password_hash($pass, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE usuarios SET nombre=?, usuario=?, rol=?, password=? WHERE id=?");
            $stmt->execute([$nombre, $usuario, $rol, $hash, $id]);
        } else {
            // Si no, dejamos la vieja
            $stmt = $pdo->prepare("UPDATE usuarios SET nombre=?, usuario=?, rol=? WHERE id=?");
            $stmt->execute([$nombre, $usuario, $rol, $id]);
        }
    }
    echo json_encode(['success' => true]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Error (probablemente usuario duplicado): ' . $e->getMessage()]);
}
?>