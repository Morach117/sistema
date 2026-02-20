<?php
session_start();
ob_start();
require_once '../config/db.php';
header('Content-Type: application/json');
ini_set('display_errors', 0);
error_reporting(0);

try {
    if (!isset($_SESSION['user_id'])) throw new Exception('No autorizado');
    $id = $_POST['id_item'] ?? null;
    $campo = $_POST['campo'] ?? null;
    $valor = $_POST['valor'] ?? null;
    // Agregamos 'aplica_descuento' para seguridad
    $permitidos = ['cantidad_real', 'es_paquete', 'piezas_por_paquete', 'clave_final', 'existencia_lapiz', 'aplica_descuento_manual', 'costo_unitario', 'aplica_descuento'];

    if (!$id || !$campo || !in_array($campo, $permitidos)) throw new Exception('Datos inválidos');

    $sql = "UPDATE historial_items SET $campo = ? WHERE id = ?";
    $stmt = $pdo->prepare($sql);
    
    if(in_array($campo, ['cantidad_real', 'piezas_por_paquete', 'existencia_lapiz', 'costo_unitario'])) {
        $valor = floatval($valor);
    }
    
    $stmt->execute([$valor, $id]);
    ob_end_clean();
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    ob_end_clean();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>