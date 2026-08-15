const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sendInternalError } = require('../middleware/errors');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePagination(query = {}) {
    const limitKey = query.length === undefined ? 'limit' : 'length';
    const limit = Math.min(positiveInteger(query[limitKey], DEFAULT_LIMIT), MAX_LIMIT);

    if (query.start !== undefined) {
        const parsedStart = Number.parseInt(query.start, 10);
        const offset = Number.isSafeInteger(parsedStart) && parsedStart >= 0 ? parsedStart : 0;
        return { offset, limit };
    }

    const page = positiveInteger(query.page, 1);
    const offset = Math.min((page - 1) * limit, Number.MAX_SAFE_INTEGER);
    return { offset, limit };
}

// Middleware to protect routes
router.use(authMiddleware);
router.use(authorize({ module: 'catalogo', action: 'read' }));

// Endpoint for DataTables (Server-side processing)
router.post('/dt', async (req, res) => {
    const draw = parseInt(req.body.draw) || 1;
    const { offset, limit } = parsePagination(req.body);
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

        sql += ' ORDER BY fecha_actualizacion DESC LIMIT ? OFFSET ?';
        const [data] = await pool.execute(sql, [...params, limit, offset]);

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
    const { offset, limit } = parsePagination(req.query);
    const page = Math.floor(offset / limit) + 1;
    const search = req.query.search || '';

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

        sql += ' ORDER BY fecha_actualizacion DESC LIMIT ? OFFSET ?';
        const [data] = await pool.execute(sql, [...params, limit, offset]);

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
module.exports.parsePagination = parsePagination;
