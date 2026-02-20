<?php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

try {
    $uid = $_SESSION['user_id'] ?? 1;
    $codigo = $_POST['codigo'];
    $clave_sicar = $_POST['clave_sicar'];
    $existencia = floatval($_POST['existencia']); 
    $bultos = floatval($_POST['bultos']);
    $factor = intval($_POST['factor']);
    $descripcion = $_POST['descripcion_actual'];
    
    // Recibimos el modo (VENTA o CONSUMO)
    $tipo_uso = $_POST['tipo_uso'] ?? 'VENTA';

    if(empty($descripcion) || $descripcion === '---') {
        $descripcion = 'Producto Manual ' . $codigo;
    }
    if ($factor <= 0) $factor = 1;
    $total_unidades = ($bultos * $factor) + $existencia;

    $pdo->beginTransaction();

    // 1. APRENDIZAJE DE PRODUCTO NUEVO
    if (isset($_POST['registrar_nuevo']) && $_POST['registrar_nuevo'] === 'true') {
        $check = $pdo->prepare("SELECT id FROM configuracion_cajas WHERE codigo_barras = ?");
        $check->execute([$codigo]);
        if ($check->rowCount() == 0) {
            $sqlConf = "INSERT INTO configuracion_cajas (codigo_barras, clave_sicar, cantidad_unidades, descripcion, estado, modo_preferido) VALUES (?, ?, ?, ?, 'ACTIVO', ?)";
            $pdo->prepare($sqlConf)->execute([$codigo, $clave_sicar, $factor, $descripcion, $tipo_uso]);
        }
    } else {
        // 1.1. ACTUALIZACIÓN DE MEMORIA (Aprender el modo preferido)
        // Si el producto ya existe, actualizamos su "modo_preferido" basado en lo que acabas de hacer
        $sqlUpdate = "UPDATE configuracion_cajas SET modo_preferido = ? WHERE codigo_barras = ?";
        $pdo->prepare($sqlUpdate)->execute([$tipo_uso, $codigo]);
    }

    // 2. GUARDAR HISTORIAL
    $sqlHist = "INSERT INTO historial_rapido 
        (usuario_id, codigo, clave_sicar, descripcion_cache, cantidad_bultos, factor, existencia, total_unidades, fecha, estatus, tipo_uso) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, ?)";
        
    $pdo->prepare($sqlHist)->execute([
        $uid, $codigo, $clave_sicar, $descripcion, $bultos, $factor, $existencia, $total_unidades, $tipo_uso
    ]);

    $pdo->commit();
    echo json_encode(['success' => true, 'total' => $total_unidades]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>