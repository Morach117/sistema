<?php
// api/api_listar_tareas.php
session_start();
require_once '../config/db.php';

// Validar sesión
if (!isset($_SESSION['user_id'])) exit;

try {
    $sql = "SELECT id, numero_remision, proveedor, fecha_carga, estado, 
            (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id) as items 
            FROM historial_remisiones hr 
            WHERE estado IN ('PENDIENTE', 'ENVIADO', 'REVISION') 
            ORDER BY fecha_carga DESC";
    $stmt = $pdo->query($sql);

    if ($stmt->rowCount() == 0) {
        echo '<div class="flex flex-col items-center justify-center h-40 opacity-40 text-gray-500"><i class="bi bi-calendar-check text-4xl mb-2"></i><span>Al día</span></div>';
    } else {
        while ($row = $stmt->fetch()) {
            $border = ($row['estado'] === 'REVISION') ? 'border-l-warning' : 'border-l-primary';
            $badge = ($row['estado'] === 'REVISION') ? 'badge-warning' : 'badge-ghost';
            
            $p = strtoupper($row['proveedor'] ?? '');
            $iconProv = ($p === 'TONY') ? '🐯' : (($p === 'PAOLA' || $p === 'OPERADORA') ? '📄' : (($p === 'OPTIVOSA') ? '👓' : '📦'));
            $provJs = !empty($row['proveedor']) ? $row['proveedor'] : 'MANUAL';
            
            // Renderizamos la tarjeta igual que en el archivo principal
            echo '
            <div class="card bg-white border border-base-200 border-l-4 '.$border.' shadow-sm hover:shadow-md cursor-pointer transition-all rounded-md p-3 group active:bg-base-100" onclick="FacturasAPI.iniciarCarga('.$row['id'].', \''.$provJs.'\')">
                <div class="flex justify-between items-center mb-1">
                    <h3 class="font-bold text-gray-800 text-base group-hover:text-primary transition-colors">'.htmlspecialchars($row['numero_remision']).'</h3>
                    <span class="badge badge-sm font-bold '.$badge.'">'.$row['estado'].'</span>
                </div>
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <span>'.$iconProv.' '.date('d M • H:i', strtotime($row['fecha_carga'])).'</span>
                    <span class="font-bold text-sm text-gray-700">'.$row['items'].' items</span>
                </div>
            </div>';
        }
    }
} catch (Exception $e) {
    echo '<div class="text-error text-xs p-2">Error cargando lista</div>';
}
?>