<?php
// api/api_rechazar_item.php
session_start();
require_once '../config/db.php';

header('Content-Type: application/json');

// Solo admin puede rechazar
if (!isset($_SESSION['rol']) || $_SESSION['rol'] !== 'admin') {
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $remision_id = $_POST['remision_id'] ?? 0;
    $cod_prov    = $_POST['cod_prov'] ?? '';
    $motivo      = $_POST['motivo'] ?? 'Corrección requerida';

    try {
        $pdo->beginTransaction();

        // 1. Marcar el ÍTEM específico como REVISION y guardar la nota
        $stmt = $pdo->prepare("UPDATE historial_items 
                               SET estado_item = 'REVISION', 
                                   notas_revision = ? 
                               WHERE remision_id = ? AND codigo_proveedor = ?");
        $stmt->execute([$motivo, $remision_id, $cod_prov]);

        // 2. Marcar la REMISIÓN completa como REVISION (para que el empleado la vea)
        $stmtRem = $pdo->prepare("UPDATE historial_remisiones SET estado = 'REVISION' WHERE id = ?");
        $stmtRem->execute([$remision_id]);

        $pdo->commit();
        echo json_encode(['success' => true]);

    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}
?>