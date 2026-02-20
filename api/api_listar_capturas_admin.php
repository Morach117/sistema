<?php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

$fecha = $_POST['fecha'] ?? date('Y-m-d');

try {
    // Agregamos 'h.exportado' a la lista de campos
    $sql = "SELECT 
                h.id, 
                h.clave_sicar, 
                h.descripcion_cache as descripcion, 
                h.cantidad_bultos as bultos, 
                h.factor, 
                h.existencia, 
                h.total_unidades, 
                h.tipo_uso,
                h.exportado,  /* <--- NUEVO CAMPO IMPORTANTE */
                DATE_FORMAT(h.fecha, '%H:%i') as hora,
                IF(h.factor > 1, 1, 0) as es_caja,
                'Admin' as usuario 
            FROM historial_rapido h
            WHERE DATE(h.fecha) = ? AND h.estatus = 1
            ORDER BY h.id DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$fecha]);
    
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode(['success' => true, 'data' => $data]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>