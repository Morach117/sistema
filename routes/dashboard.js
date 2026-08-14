const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

router.use(authMiddleware);
router.use(authorize({ module: 'dashboard', action: 'read' }));

router.get('/', async (req, res) => {
    try {
        const [pendientesRows] = await pool.execute("SELECT COUNT(*) as count FROM historial_remisiones WHERE estado IN ('PENDIENTE', 'REVISION')");
        const pendientes = pendientesRows[0].count;

        const [finalizadasHoyRows] = await pool.execute("SELECT COUNT(*) as count FROM historial_remisiones WHERE estado = 'FINALIZADO' AND DATE(fecha_carga) = CURDATE()");
        const finalizadasHoy = finalizadasHoyRows[0].count;

        const [totalItemsRows] = await pool.execute("SELECT COUNT(*) as count FROM historial_items");
        const totalItems = totalItemsRows[0].count;

        const [chartData] = await pool.execute(`
            SELECT DATE_FORMAT(fecha_carga, '%d/%m') as fecha, COUNT(*) as total 
            FROM historial_remisiones 
            WHERE fecha_carga >= DATE(NOW()) - INTERVAL 7 DAY
            GROUP BY DATE(fecha_carga) 
            ORDER BY fecha_carga ASC
        `);

        const [recentActivity] = await pool.execute(`
            SELECT numero_remision, estado, fecha_carga, 
            (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id) as items
            FROM historial_remisiones hr 
            ORDER BY fecha_carga DESC LIMIT 5
        `);

        if (req.user.rol === 'empleado') {
            const userId = req.user.id;
            
            // KPIs de Captura del día para el empleado
            const [capturasHoyRows] = await pool.execute(
                "SELECT COUNT(*) as count, COALESCE(SUM(cantidad_bultos * factor + existencia), 0) as total_piezas FROM historial_rapido WHERE usuario_id = ? AND DATE(fecha) = CURDATE()",
                [userId]
            );
            
            // Reclamaciones asignadas (si hubiera alguna lógica, por ahora usamos pendientes generales o asignadas)
            // Ya que el frontend pide /api/reclamaciones por aparte, aquí mandamos solo capturas.

            res.json({
                success: true,
                kpis: { pendientes, finalizadas_hoy: finalizadasHoy, total_items: totalItems },
                chart: chartData,
                activity: recentActivity,
                capturas_hoy: capturasHoyRows[0]
            });
        } else {
            res.json({
                success: true,
                kpis: { pendientes, finalizadas_hoy: finalizadasHoy, total_items: totalItems },
                chart: chartData,
                activity: recentActivity
            });
        }

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
