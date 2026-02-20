<?php
session_start();
require_once '../config/db.php';

// 1. ZONA HORARIA
date_default_timezone_set('America/Mexico_City');

// Cabeceras Anti-Caché
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");
header('Content-Type: text/html; charset=utf-8');

// 2. FILTRAR SOLO REGISTROS DE "HOY"
$hoy = date('Y-m-d'); 

$sql = "SELECT * FROM historial_rapido 
        WHERE estatus = 1 
        AND DATE(fecha) = ? 
        ORDER BY id DESC";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$hoy]);

    if ($stmt->rowCount() > 0) {
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            // Datos básicos
            $esCaja = ($r['factor'] > 1);
            $esConsumo = ($r['tipo_uso'] === 'CONSUMO');
            $yaExportado = ($r['exportado'] == 1); // <--- DETECTAMOS SI YA SE EXPORTÓ

            // 1. Lógica de Colores y Badges
            if ($esConsumo) {
                $badge = '<span class="badge badge-xs bg-orange-100 text-orange-700 border-0 font-bold">USO</span>';
                $claseFila = "bg-orange-50/30"; // Color base suave
            } else {
                $badge = $esCaja 
                    ? '<span class="badge badge-xs bg-indigo-100 text-indigo-700 border-0 font-bold">CAJA</span>' 
                    : '<span class="badge badge-xs bg-slate-100 text-slate-500 border-0">PZ</span>';
                $claseFila = ""; // Blanco por defecto
            }

            // 2. Lógica "GHOST" (Si ya se exportó)
            if ($yaExportado) {
                // Si ya se bajó al Excel, lo ponemos gris y "desactivado" visualmente
                $claseFila = "bg-gray-50 opacity-60 grayscale"; 
                $accionBtn = '<div class="text-green-500 tooltip tooltip-left" data-tip="Ya procesado"><i class="bi bi-check-circle-fill text-lg"></i></div>';
            } else {
                // Si es nuevo, color normal y botón de borrar activo
                $claseFila .= " hover:bg-indigo-50/30"; 
                $accionBtn = "<button onclick='CapturaAPI.eliminar({$r['id']})' class='btn btn-ghost btn-xs text-red-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all rounded-md' title='Descartar'><i class='bi bi-x-lg text-sm'></i></button>";
            }
            
            $total = number_format($r['total_unidades'], 0);
            $desc = htmlspecialchars($r['descripcion_cache'] ?? 'Producto');
            $cantMostrar = ($r['cantidad_bultos'] > 0) ? $r['cantidad_bultos'] : $r['existencia'];
            
            echo "
            <tr class='{$claseFila} transition-all group border-b border-slate-100 last:border-0'>
                <td class='font-mono font-bold text-slate-600 pl-6 text-xs py-3'>{$r['codigo']}</td>
                <td class='py-3'>
                    <div class='font-bold text-slate-700 text-[11px] leading-tight'>{$desc}</div>
                    <div class='text-[9px] text-slate-400 font-mono mt-0.5'>SICAR: {$r['clave_sicar']}</div>
                </td>
                <td class='text-center py-3'>{$badge}</td>
                <td class='text-center font-bold text-slate-700 text-xs py-3'>{$cantMostrar}</td>
                <td class='text-right font-black text-slate-800 pr-8 text-xs py-3'>{$total}</td>
                <td class='text-center py-3 w-16'>
                    {$accionBtn}
                </td>
            </tr>";
        }
    } else {
        // Mensaje limpio cuando inicias el día
        echo "<tr><td colspan='6' class='text-center py-12 text-slate-300 italic text-xs'>
            <div class='flex flex-col items-center gap-3'>
                <div class='p-3 bg-slate-50 rounded-full'><i class='bi bi-sunrise text-2xl text-slate-200'></i></div>
                <span>Nuevo día, inventario en 0</span>
            </div>
        </td></tr>";
    }
} catch (Exception $e) {
    echo "<tr><td colspan='6' class='text-center text-red-400 py-4 text-xs'>Error de conexión</td></tr>";
}
?>