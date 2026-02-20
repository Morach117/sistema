<?php
// api/api_historial_producto.php
require_once '../config/db.php';
header('Content-Type: application/json');

$q = $_GET['q'] ?? '';

if (strlen($q) < 2) {
    echo json_encode([]);
    exit;
}

try {
    // CORRECCIÓN: Usamos los nombres reales de tu tabla (descripcion_original, costo_unitario)
    // y los renombramos con 'AS' para que el Javascript los entienda sin cambios.
    $sql = "SELECT 
                hi.descripcion_original AS descripcion, 
                hi.codigo_proveedor, 
                hi.costo_unitario AS costo, 
                hi.precio_venta, 
                hi.existencia_lapiz AS cantidad,
                hr.numero_remision, 
                hr.fecha_carga
            FROM historial_items hi
            INNER JOIN historial_remisiones hr ON hi.remision_id = hr.id
            WHERE hi.descripcion_original LIKE ? 
               OR hi.codigo_proveedor LIKE ? 
               OR hi.clave_final LIKE ?
            ORDER BY hr.fecha_carga DESC
            LIMIT 50";

    $stmt = $pdo->prepare($sql);
    $param = "%$q%";
    $stmt->execute([$param, $param, $param]);
    $resultados = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Agrupamos por producto
    $agrupado = [];
    foreach ($resultados as $r) {
        // Usamos descripcion_original que ahora viene como 'descripcion' gracias al alias
        $desc = $r['descripcion'] ?? '(Sin descripción)';
        $key = $r['codigo_proveedor'] . ' - ' . $desc;
        
        if (!isset($agrupado[$key])) {
            $agrupado[$key] = [];
        }
        $agrupado[$key][] = $r;
    }

    echo json_encode(['success' => true, 'data' => $agrupado]);

} catch (Exception $e) {
    // Enviar el error detallado para depuración
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>