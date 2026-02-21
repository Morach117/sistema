<?php
require_once '../config/db.php';
header('Content-Type: application/json');

$codigo = $_POST['codigo'] ?? '';

if(empty($codigo)){
    echo json_encode(['success' => false, 'error' => 'Código vacío']);
    exit;
}

try {
    // Busca DIRECTAMENTE en tu catálogo maestro (cat_productos)
    $sql = "SELECT clave_sicar, descripcion FROM cat_productos WHERE codigo_barras = ? OR clave_sicar = ? LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$codigo, $codigo]);

    if($row = $stmt->fetch(PDO::FETCH_ASSOC)){
        echo json_encode([
            'success' => true,
            'data' => [
                'clave_sicar' => $row['clave_sicar'],
                'descripcion' => $row['descripcion'] // <-- AQUÍ SE TRAE EL NOMBRE OFICIAL DE SICAR
            ]
        ]);
    } else {
        echo json_encode(['success' => false, 'error' => 'No encontrado en SICAR']);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Error de BD']);
}
?>