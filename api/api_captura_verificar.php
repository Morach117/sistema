<?php
require_once '../config/db.php';
header('Content-Type: application/json');

$codigo = $_POST['codigo'] ?? '';

if(empty($codigo)){
    echo json_encode(['tipo' => 'ERROR', 'mensaje' => 'Codigo vacio']);
    exit;
}

try {
    // Buscamos en el catálogo de cajas (donde guardamos la configuración)
    $sql = "SELECT * FROM configuracion_cajas WHERE codigo_barras = ? LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$codigo]);

    if($row = $stmt->fetch(PDO::FETCH_ASSOC)){
        // ENCONTRADO
        echo json_encode([
            'tipo' => 'CONOCIDO',
            'clave_sicar' => $row['clave_sicar'],
            'descripcion_caja' => $row['descripcion'],
            'factor' => $row['cantidad_unidades'],
            // Enviamos la memoria. Si no existe la columna aun, enviamos 'VENTA' por defecto para que no falle.
            'modo_preferido' => $row['modo_preferido'] ?? 'VENTA' 
        ]);
    } else {
        // NO ENCONTRADO (NUEVO)
        echo json_encode([
            'tipo' => 'DESCONOCIDO',
            'descripcion_caja' => 'PRODUCTO NUEVO',
            'modo_preferido' => 'VENTA' // Por defecto
        ]);
    }
} catch (Exception $e) {
    // Si hay error (ej. falta la columna en BD), respondemos algo válido para que no se trabe
    echo json_encode([
        'tipo' => 'DESCONOCIDO',
        'error' => $e->getMessage(),
        'modo_preferido' => 'VENTA'
    ]);
}
?>