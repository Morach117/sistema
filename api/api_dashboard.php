<?php
// api/api_dashboard.php
session_start();
require_once '../config/db.php';

header('Content-Type: application/json');
ini_set('display_errors', 0);
error_reporting(0);

try {
    // 1. KPI: Pendientes
    $stmt = $pdo->query("SELECT COUNT(*) FROM historial_remisiones WHERE estado IN ('PENDIENTE', 'REVISION')");
    $pendientes = $stmt->fetchColumn();

    // 2. KPI: Finalizadas HOY
    $stmt = $pdo->query("SELECT COUNT(*) FROM historial_remisiones WHERE estado = 'FINALIZADO' AND DATE(fecha_carga) = CURDATE()");
    $finalizadasHoy = $stmt->fetchColumn();

    // 3. KPI: Total Items Procesados (Histórico)
    $stmt = $pdo->query("SELECT COUNT(*) FROM historial_items");
    $totalItems = $stmt->fetchColumn();

    // 4. GRÁFICA: Actividad últimos 7 días (Remisiones cargadas)
    $sqlChart = "SELECT DATE_FORMAT(fecha_carga, '%d/%m') as fecha, COUNT(*) as total 
                 FROM historial_remisiones 
                 WHERE fecha_carga >= DATE(NOW()) - INTERVAL 7 DAY
                 GROUP BY DATE(fecha_carga) 
                 ORDER BY fecha_carga ASC";
    $stmtChart = $pdo->query($sqlChart);
    $chartData = $stmtChart->fetchAll(PDO::FETCH_ASSOC);

    // 5. LISTA: Últimas 5 Remisiones
    $sqlList = "SELECT numero_remision, estado, fecha_carga, 
                (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id) as items
                FROM historial_remisiones hr 
                ORDER BY fecha_carga DESC LIMIT 5";
    $stmtList = $pdo->query($sqlList);
    $recentActivity = $stmtList->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'kpis' => [
            'pendientes' => $pendientes,
            'finalizadas_hoy' => $finalizadasHoy,
            'total_items' => $totalItems
        ],
        'chart' => $chartData,
        'activity' => $recentActivity
    ]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>