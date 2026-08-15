const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sendInternalError } = require('../middleware/errors');

router.use(authMiddleware);
router.use(authorize({ module: 'dashboard', action: 'read' }));

router.get('/', async (req, res) => {
    try {
        const [summaryRows] = await pool.execute(`
            SELECT
                (SELECT COUNT(*) FROM historial_remisiones WHERE estado IN (?, ?)) AS pendientes,
                (SELECT COUNT(*) FROM historial_remisiones
                    WHERE estado = ?
                      AND fecha_carga >= CURRENT_DATE
                      AND fecha_carga < CURRENT_DATE + INTERVAL 1 DAY) AS finalizadas_hoy,
                (SELECT COUNT(*) FROM historial_items) AS total_items
        `, ['PENDIENTE', 'REVISION', 'FINALIZADO']);
        const {
            pendientes,
            finalizadas_hoy: finalizadasHoy,
            total_items: totalItems
        } = summaryRows[0];

        const [chartData] = await pool.execute(`
            SELECT DATE_FORMAT(fecha_carga, '%d/%m') as fecha, COUNT(*) as total 
            FROM historial_remisiones 
            WHERE fecha_carga >= CURRENT_DATE - INTERVAL 7 DAY
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
                `SELECT COUNT(*) as count,
                        COALESCE(SUM(cantidad_bultos * factor + existencia), 0) as total_piezas
                 FROM historial_rapido
                 WHERE usuario_id = ?
                   AND fecha >= CURRENT_DATE
                   AND fecha < CURRENT_DATE + INTERVAL 1 DAY`,
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
        return sendInternalError(error, req, res);
    }
});

module.exports = router;
