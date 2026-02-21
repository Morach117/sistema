<?php
require_once '../config/db.php';
header('Content-Type: application/json');

$codigo = $_POST['codigo'] ?? '';

if(empty($codigo)){
    echo json_encode(['tipo' => 'ERROR', 'mensaje' => 'Codigo vacio']);
    exit;
}

try {
    // 1. PRIMERA BÚSQUEDA: Memoria Interna (Si ya la vinculaste alguna vez en este módulo)
    $sqlCaja = "SELECT * FROM configuracion_cajas WHERE codigo_barras = ? LIMIT 1";
    $stmtCaja = $pdo->prepare($sqlCaja);
    $stmtCaja->execute([$codigo]);

    if($row = $stmtCaja->fetch(PDO::FETCH_ASSOC)){
        echo json_encode([
            'tipo' => 'CONOCIDO_MEMORIA', // Ya sabemos qué factor tiene y su nombre compuesto
            'clave_sicar' => $row['clave_sicar'],
            'descripcion_caja' => $row['descripcion'], 
            'factor' => floatval($row['cantidad_unidades']),
            'modo_preferido' => $row['modo_preferido'] ?? 'VENTA'
        ]);
        exit;
    } 
    
    // 2. SEGUNDA BÚSQUEDA: Catálogo Oficial (Tu POS / cat_productos)
    // Aquí es donde encontrará la caja "0799192419614" de tu ejemplo.
    $sqlCat = "SELECT * FROM cat_productos WHERE codigo_barras = ? OR clave_sicar = ? LIMIT 1";
    $stmtCat = $pdo->prepare($sqlCat);
    $stmtCat->execute([$codigo, $codigo]);

    if($rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC)){
        echo json_encode([
            'tipo' => 'NUEVO_CATALOGO', // Está en el POS, pero falta decirle a este módulo si es suelto o caja
            'clave_sicar' => $rowCat['clave_sicar'],
            'descripcion_caja' => $rowCat['descripcion'], // <-- NOMBRE DE LA CAJA EN TU BD
            'factor' => 1, 
            'modo_preferido' => 'VENTA'
        ]);
        exit;
    }

    // 3. TERCERA BÚSQUEDA: Tabla de Relaciones (Proveedores)
    $sqlRel = "SELECT cp.descripcion FROM rel_codigos_proveedor rcp JOIN cat_productos cp ON rcp.clave_sicar = cp.clave_sicar WHERE rcp.codigo_proveedor = ? LIMIT 1";
    $stmtRel = $pdo->prepare($sqlRel);
    $stmtRel->execute([$codigo]);
    
    if($rowRel = $stmtRel->fetch(PDO::FETCH_ASSOC)){
        echo json_encode([
            'tipo' => 'NUEVO_CATALOGO',
            'clave_sicar' => $rowRel['clave_sicar'],
            'descripcion_caja' => $rowRel['descripcion'],
            'factor' => 1,
            'modo_preferido' => 'VENTA'
        ]);
        exit;
    }

    // 4. DE PLANO NO EXISTE EN TU BD
    echo json_encode([
        'tipo' => 'DESCONOCIDO',
        'descripcion_caja' => 'PRODUCTO NUEVO (SIN REGISTRO)',
        'modo_preferido' => 'VENTA'
    ]);
    
} catch (Exception $e) {
    echo json_encode(['tipo' => 'DESCONOCIDO', 'error' => $e->getMessage(), 'modo_preferido' => 'VENTA']);
}
?>