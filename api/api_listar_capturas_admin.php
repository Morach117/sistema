<?php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

$fecha = $_POST['fecha'] ?? date('Y-m-d');

try {
    // 1. Hacemos LEFT JOIN con usuarios Y con cat_productos para rescatar ambos nombres
    $sql = "SELECT 
                h.id, 
                h.clave_sicar, 
                h.descripcion_cache, 
                h.cantidad_bultos as bultos, 
                h.factor, 
                h.existencia, 
                h.total_unidades, 
                h.tipo_uso,
                h.exportado, 
                DATE_FORMAT(h.fecha, '%H:%i') as hora,
                IF(h.factor > 1, 1, 0) as es_caja,
                COALESCE(u.nombre, 'Desconocido') as usuario,
                cp.descripcion as nombre_pieza /* <--- TRAEMOS EL NOMBRE SUELTO DE TU BD */
            FROM historial_rapido h
            LEFT JOIN usuarios u ON h.usuario_id = u.id 
            LEFT JOIN cat_productos cp ON h.clave_sicar = cp.clave_sicar /* <--- UNIÓN CON CATÁLOGO */
            WHERE DATE(h.fecha) = ? AND h.estatus = 1
            ORDER BY h.id DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$fecha]);
    
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // 2. MAGIA PARA JUNTAR LOS NOMBRES ANTES DE ENVIARLOS AL DISEÑO
    foreach ($data as &$row) {
        $descCache = trim($row['descripcion_cache']);
        $descPieza = trim($row['nombre_pieza'] ?? '');
        
        // A) Si la descripción ya tiene la flecha (fue vinculada recientemente en tu nueva versión), se queda así.
        if (strpos($descCache, '➔') !== false) {
            $row['descripcion'] = $descCache;
        } 
        // B) Si NO tiene la flecha, pero el nombre en la BD es diferente al de la caja (Ej. Bombin C/12 vs Bombin)
        else if (!empty($descPieza) && $descCache !== $descPieza) {
            // Le inyectamos la flecha "➔" para que tu Javascript lo separe en dos renglones bonitos
            $row['descripcion'] = "CAJA: " . $descCache . " ➔ PIEZA: " . $descPieza;
        } 
        // C) Si son exactamente iguales (es solo una pieza suelta), lo dejamos normal
        else {
            $row['descripcion'] = $descCache;
        }
        
        // Limpiamos las variables temporales para que el JSON quede limpio
        unset($row['descripcion_cache']);
        unset($row['nombre_pieza']);
    }
    
    echo json_encode(['success' => true, 'data' => $data]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>