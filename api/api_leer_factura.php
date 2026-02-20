<?php
// api/api_leer_factura.php
session_start();
ob_start(); // Buffer para evitar salidas indeseadas

require_once '../config/db.php';
header('Content-Type: application/json');
ini_set('display_errors', 0);
error_reporting(0);

$id = $_GET['id'] ?? null;

try {
    if (!$id) throw new Exception('ID no especificado');

    // 1. OBTENER CABECERA DE LA REMISIÓN
    $stmt = $pdo->prepare("SELECT * FROM historial_remisiones WHERE id = ?");
    $stmt->execute([$id]);
    $cabecera = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$cabecera) throw new Exception("Remisión no encontrada");

    // 2. CONSULTA INTELIGENTE DE ITEMS
    // Unimos historial_items con cat_productos Y con rel_codigos_proveedor
    $sqlItems = "
        SELECT 
            hi.*, 
            -- Datos del Catálogo (Sistema Actual)
            cp.precio_compra as costo_bd, 
            cp.precio_venta as venta_bd,
            cp.descripcion as desc_bd,
            cp.clave_sicar as clave_catalogo,
            
            -- Datos de la Memoria (Tabla de Relaciones)
            rcp.clave_sicar as clave_memoria,
            rcp.es_paquete as es_paquete_mem,
            rcp.piezas_por_paquete as piezas_mem
            
        FROM historial_items hi
        
        -- A. Consultamos la Memoria (Relación Proveedor -> SICAR)
        LEFT JOIN rel_codigos_proveedor rcp ON hi.codigo_proveedor = rcp.codigo_proveedor
        
        -- B. Consultamos el Catálogo Maestro (Para precios y descripciones)
        LEFT JOIN cat_productos cp ON (
            -- Prioridad 1: El usuario ya fijó una clave final manual
            (hi.clave_final IS NOT NULL AND hi.clave_final != '' AND cp.clave_sicar = hi.clave_final) 
            OR 
            -- Prioridad 2: Ya se había guardado una clave SICAR en el historial
            (hi.clave_sicar IS NOT NULL AND hi.clave_sicar != '' AND cp.clave_sicar = hi.clave_sicar)
            OR
            -- Prioridad 3: MEMORIA (La tabla rel_codigos_proveedor tiene el vínculo)
            (rcp.clave_sicar IS NOT NULL AND cp.clave_sicar = rcp.clave_sicar)
            OR
            -- Prioridad 4: Match Directo (El código del proveedor es igual al código de barras)
            (hi.codigo_proveedor IS NOT NULL AND hi.codigo_proveedor != '' AND cp.codigo_barras = hi.codigo_proveedor)
        )
        WHERE hi.remision_id = ?
        ORDER BY hi.id ASC
    ";

    $stmtItems = $pdo->prepare($sqlItems);
    $stmtItems->execute([$id]);
    $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

    $grupos = [];
    $folio = $cabecera['numero_remision'];
    $grupos[$folio] = [];

    foreach ($items as $item) {
        // LÓGICA DE DEFINICIÓN DE DATOS FINALES
        
        // 1. Definir Clave SICAR sugerida
        // Usamos la que ya esté fija, o la del historial, o la de la memoria, o la del catálogo directo
        $claveSugerida = $item['clave_final'];
        if (empty($claveSugerida)) $claveSugerida = $item['clave_sicar'];
        if (empty($claveSugerida)) $claveSugerida = $item['clave_memoria']; // <--- Aquí entra la inteligencia
        if (empty($claveSugerida)) $claveSugerida = $item['clave_catalogo']; // Match directo de barras

        // 2. Definir Configuración de Paquete (Si viene vacío, usamos la memoria)
        $esPaquete = $item['es_paquete'];
        $piezas = $item['piezas_por_paquete'];

        // Si en el historial no está definido (es NULL), intentamos tomarlo de la memoria
        if ($esPaquete === null && isset($item['es_paquete_mem'])) {
            $esPaquete = $item['es_paquete_mem'];
            $piezas = $item['piezas_mem'];
        }

        // Construir respuesta limpia para el Frontend
        $grupos[$folio][] = [
            'id' => $item['id'],
            'cod_prov' => $item['codigo_proveedor'],
            'desc' => $item['descripcion_original'], // Descripción original de la factura
            'desc_sistema' => $item['desc_bd'], // Descripción oficial del sistema
            'cant' => floatval($item['cantidad']),
            'costo' => floatval($item['costo_unitario']),
            'es_paquete' => $esPaquete,
            'piezas_por_paquete' => $piezas,
            
            // Enviamos la clave calculada
            'clave_final' => $item['clave_final'], // Lo que el usuario escribió (si existe)
            'clave_sicar' => $claveSugerida,       // La mejor coincidencia encontrada
            
            'existencia_lapiz' => $item['existencia_lapiz'],
            'aplica_iva' => $item['aplica_iva'],
            'aplica_descuento' => $item['aplica_descuento'],
            'aplica_descuento_manual' => isset($item['aplica_descuento_manual']) ? $item['aplica_descuento_manual'] : null,
            'revision_pendiente' => $item['revision_pendiente'],
            
            // Precios informativos
            'costo_sistema_actual' => $item['costo_bd'] !== null ? floatval($item['costo_bd']) : 0, 
            'precio_venta_sistema' => $item['venta_bd'] !== null ? floatval($item['venta_bd']) : 0
        ];
    }

    ob_end_clean();
    echo json_encode([
        'success' => true, 
        'datos' => $grupos, 
        'estado' => $cabecera['estado'],
        'proveedor' => $cabecera['proveedor']
    ]);

} catch (Exception $e) {
    ob_end_clean();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>