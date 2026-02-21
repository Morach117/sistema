<?php
session_start();
require_once '../config/db.php';
header('Content-Type: application/json');

// ZONA HORARIA
date_default_timezone_set('America/Mexico_City');

try {
    $hoy = date('Y-m-d');
    
    // ==========================================
    // 1. OBTENER KPIs DEL DÍA DE HOY
    // ==========================================
    
    // Movimientos Totales Hoy
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM historial_rapido WHERE DATE(fecha) = ? AND estatus = 1");
    $stmt->execute([$hoy]);
    $movimientosHoy = $stmt->fetchColumn();
    
    // Ritmo por hora (Cuántos han capturado en los últimos 60 minutos)
    $stmtRitmo = $pdo->prepare("SELECT COUNT(*) FROM historial_rapido WHERE fecha >= DATE_SUB(NOW(), INTERVAL 1 HOUR) AND estatus = 1");
    $stmtRitmo->execute();
    $ritmoHora = $stmtRitmo->fetchColumn();

    // Cajas vs Sueltos Hoy
    $stmt = $pdo->prepare("
        SELECT 
            SUM(IF(factor > 1, cantidad_bultos, 0)) as cajas,
            SUM(IF(factor = 1, existencia, 0)) as sueltos
        FROM historial_rapido 
        WHERE DATE(fecha) = ? AND estatus = 1 AND tipo_uso = 'VENTA'
    ");
    $stmt->execute([$hoy]);
    $cantidades = $stmt->fetch(PDO::FETCH_ASSOC);
    $cajasHoy = (float)($cantidades['cajas'] ?? 0);
    $sueltosHoy = (float)($cantidades['sueltos'] ?? 0);

    // Movimientos de Uso Interno Hoy
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM historial_rapido WHERE DATE(fecha) = ? AND estatus = 1 AND tipo_uso = 'CONSUMO'");
    $stmt->execute([$hoy]);
    $usoHoy = $stmt->fetchColumn();

    // ==========================================
    // 2. OBTENER RANKING DE EMPLEADOS HOY
    // ==========================================
    $sqlRanking = "
        SELECT COALESCE(u.nombre, 'Desconocido') as nombre, COUNT(h.id) as total_capturas
        FROM historial_rapido h
        LEFT JOIN usuarios u ON h.usuario_id = u.id
        WHERE DATE(h.fecha) = ? AND h.estatus = 1
        GROUP BY h.usuario_id
        ORDER BY total_capturas DESC
        LIMIT 5
    ";
    $stmtRanking = $pdo->prepare($sqlRanking);
    $stmtRanking->execute([$hoy]);
    $ranking = $stmtRanking->fetchAll(PDO::FETCH_ASSOC);

    // ==========================================
    // 3. OBTENER DATOS GRÁFICA (ÚLTIMOS 7 DÍAS)
    // ==========================================
    $sqlChart = "
        SELECT 
            DATE(fecha) as fecha,
            DATE_FORMAT(fecha, '%d %b') as fecha_corta,
            SUM(IF(tipo_uso = 'VENTA', 1, 0)) as venta,
            SUM(IF(tipo_uso = 'CONSUMO', 1, 0)) as uso
        FROM historial_rapido
        WHERE fecha >= DATE(NOW()) - INTERVAL 6 DAY AND estatus = 1
        GROUP BY DATE(fecha)
        ORDER BY DATE(fecha) ASC
    ";
    $stmtChart = $pdo->query($sqlChart);
    $chartData = $stmtChart->fetchAll(PDO::FETCH_ASSOC);

    // Generar respuesta limpia
    echo json_encode([
        'success' => true,
        'kpis' => [
            'movimientos_hoy' => $movimientosHoy,
            'cajas_hoy' => $cajasHoy,
            'sueltos_hoy' => $sueltosHoy,
            'uso_interno_hoy' => $usoHoy,
            'ritmo_hora' => $ritmoHora
        ],
        'ranking' => $ranking,
        'chart' => $chartData
    ]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>