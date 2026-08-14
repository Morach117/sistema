const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sendInternalError } = require('../middleware/errors');

// Middleware to protect routes
router.use(authMiddleware);
router.use(authorize({ module: 'catalogo', action: 'read' }));

// Endpoint for DataTables (Server-side processing)
router.post('/dt', async (req, res) => {
    const draw = parseInt(req.body.draw) || 1;
    const start = parseInt(req.body.start) || 0;
    const length = parseInt(req.body.length) || 10;
    const searchValue = req.body.search && req.body.search.value ? req.body.search.value : '';

    try {
        const [totalRows] = await pool.execute('SELECT COUNT(*) as count FROM cat_productos');
        const recordsTotal = totalRows[0].count;

        let sql = 'SELECT * FROM cat_productos ';
        let countSql = 'SELECT COUNT(*) as count FROM cat_productos ';
        let params = [];

        if (searchValue) {
            const searchClause = ' WHERE clave_sicar LIKE ? OR codigo_barras LIKE ? OR descripcion LIKE ? ';
            sql += searchClause;
            countSql += searchClause;
            const likeStr = `%${searchValue}%`;
            params = [likeStr, likeStr, likeStr];
        }

        const [filteredRows] = await pool.execute(countSql, params);
        const recordsFiltered = filteredRows[0].count;

        sql += ` ORDER BY fecha_actualizacion DESC LIMIT ${start}, ${length}`;
        const [data] = await pool.execute(sql, params);

        res.json({
            draw,
            recordsTotal,
            recordsFiltered,
            data
        });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Endpoint REST estándar para paginación server-side con React
router.get('/list', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    try {
        let sql = 'SELECT * FROM cat_productos ';
        let countSql = 'SELECT COUNT(*) as count FROM cat_productos ';
        let params = [];

        if (search) {
            const searchClause = ' WHERE clave_sicar LIKE ? OR codigo_barras LIKE ? OR descripcion LIKE ? ';
            sql += searchClause;
            countSql += searchClause;
            const likeStr = `%${search}%`;
            params = [likeStr, likeStr, likeStr];
        }

        const [totalRows] = await pool.execute(countSql, params);
        const total = totalRows[0].count;

        sql += ` ORDER BY fecha_actualizacion DESC LIMIT ${offset}, ${limit}`;
        const [data] = await pool.execute(sql, params);

        res.json({
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

module.exports = router;
