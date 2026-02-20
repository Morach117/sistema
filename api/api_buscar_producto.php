<?php
// api/api_buscar_producto.php
require_once '../config/db.php';
header('Content-Type: application/json');

$codigo = trim($_POST['codigo'] ?? '');

try {
    // Buscamos por código de barras O por clave sicar
    $stmt = $pdo->prepare("SELECT clave_sicar, descripcion, codigo_barras FROM cat_productos WHERE codigo_barras = ? OR clave_sicar = ? LIMIT 1");
    $stmt->execute([$codigo, $codigo]);
    $prod = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($prod) {
        echo json_encode(['success' => true, 'data' => $prod]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Producto no encontrado en catálogo.']);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>