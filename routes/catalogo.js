const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sendInternalError } = require('../middleware/errors');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;

function paginationError() {
    const error = new RangeError('Paginaci\u00f3n fuera de rango.');
    error.status = 400;
    error.isPublic = true;
    return error;
}

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
        if (offset > MAX_OFFSET) throw paginationError();
        return { offset, limit };
    }

    const page = positiveInteger(query.page, 1);
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset) || offset > MAX_OFFSET) throw paginationError();
    return { offset, limit };
}

// Middleware to protect routes
router.use(authMiddleware);
router.use(authorize({ module: 'catalogo', action: 'read' }));

router.get('/exact', async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) {
        const error = new RangeError('Código requerido.');
        error.status = 400;
        error.isPublic = true;
        return sendInternalError(error, req, res);
    }

    try {
        const [rows] = await pool.execute(
            'SELECT clave_sicar, codigo_barras, descripcion FROM cat_productos WHERE clave_sicar = ? OR codigo_barras = ? LIMIT 1',
            [code, code]
        );
        return res.json({ data: rows[0] || null });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Endpoint for DataTables (Server-side processing)
router.post('/dt', async (req, res) => {
    const draw = parseInt(req.body.draw) || 1;
    const searchValue = req.body.search && req.body.search.value ? req.body.search.value : '';

    try {
        const { offset, limit } = parsePagination(req.body);
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
    const search = req.query.search || '';

    try {
        const { offset, limit } = parsePagination(req.query);
        const page = Math.floor(offset / limit) + 1;
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
