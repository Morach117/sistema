const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { releaseConnection, rollbackTransaction, sendInternalError } = require('../middleware/errors');
const multer = require('multer');
const path = require('path');
const {
    ALLOWED_MIME_TYPES,
    MAX_UPLOAD_BYTES,
    parseUpload,
    UploadValidationError
} = require('../services/recepciones-service');

const upload = multer({
    dest: path.resolve(__dirname, '..', 'uploads'),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter(_req, file, callback) {
        const extension = path.extname(path.basename(file.originalname)).toLowerCase();
        const allowedMimeTypes = ALLOWED_MIME_TYPES[extension];
        if (!allowedMimeTypes || !allowedMimeTypes.has((file.mimetype || '').toLowerCase())) {
            return callback(new UploadValidationError('Solo se aceptan archivos XML o CSV validos.'));
        }
        callback(null, true);
    }
});

function receiveUpload(req, res, next) {
    upload.single('archivo_factura')(req, res, (error) => {
        if (!error) return next();
        const tooLarge = error.code === 'LIMIT_FILE_SIZE';
        return res.status(tooLarge ? 413 : 422).json({
            success: false,
            error: tooLarge ? 'El archivo excede el limite de 10 MB.' : 'Solo se permite un archivo XML o CSV valido.'
        });
    });
}
router.use(authMiddleware);
router.use(authorize({ module: 'recepciones', action: 'read' }));

// Generate the inventory export after normal API authentication/authorization.
router.post('/generar_excel', authorize({ module: 'recepciones', action: 'write' }), async (req, res) => {
    try {
        const remision_input = req.body.remision_id;
        if (!remision_input) return res.status(400).send('Error: No se especificó la remisión.');

        const [remRows] = await pool.execute(
            `SELECT id, numero_remision FROM historial_remisiones WHERE numero_remision = ? OR id = ? LIMIT 1`,
            [remision_input, remision_input]
        );
        if (remRows.length === 0) return res.status(404).send('Remisión no encontrada.');

        const id_db = remRows[0].id;
        const remision_clean = remRows[0].numero_remision.replace(/[^A-Za-z0-9\-]/g, '_');
        const today = new Date().toISOString().slice(0, 10);
        const filename = `Carga_Sicar_${remision_clean}_${today}.xls`;

        const sql = `SELECT 
                        COALESCE(
                            NULLIF(TRIM(hi.clave_final), ''), 
                            NULLIF(TRIM(hi.clave_sicar), ''), 
                            NULLIF(TRIM(MAX(rcp.clave_sicar)), ''), 
                            NULLIF(TRIM(MAX(cp.clave_sicar)), ''),
                            NULLIF(TRIM(hi.codigo_proveedor), ''), 
                            'SIN_CLAVE'
                        ) AS clave_definitiva,
                        hi.cantidad, 
                        hi.existencia_lapiz, 
                        COALESCE(hi.es_paquete, MAX(rcp.es_paquete), 0) AS es_paquete,
                        COALESCE(hi.piezas_por_paquete, MAX(rcp.piezas_por_paquete), 1) AS piezas_por_paquete 
                    FROM historial_items hi
                    LEFT JOIN rel_codigos_proveedor rcp ON hi.codigo_proveedor = rcp.codigo_proveedor
                    LEFT JOIN cat_productos cp ON hi.codigo_proveedor = cp.codigo_barras
                    WHERE hi.remision_id = ? 
                    GROUP BY hi.id
                    ORDER BY hi.id ASC`;

        const [items] = await pool.execute(sql, [id_db]);

        const agrupados = {};
        for (const row of items) {
            const clave = (row.clave_definitiva || 'SIN_CLAVE').toUpperCase();
            if (clave === 'FALTANTE' || clave === 'DEVOLUCION') continue;

            const cantidadBD = parseFloat(row.cantidad) || 0;
            const fisico = parseFloat(row.existencia_lapiz) || 0;
            const esPaquete = parseInt(row.es_paquete) || 0;
            const piezasPorCaja = parseFloat(row.piezas_por_paquete) || 1;

            let cantidadCalculada = (esPaquete === 1 && piezasPorCaja > 0) ? cantidadBD / piezasPorCaja : cantidadBD;
            const totalProducto = cantidadCalculada + fisico;

            agrupados[clave] = (agrupados[clave] || 0) + totalProducto;
        }

        let xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n`;
        xml += `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n`;
        xml += `<Styles><Style ss:ID="sH"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2c3e50" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="sT"><NumberFormat ss:Format="@"/></Style></Styles>\n`;
        xml += `<Worksheet ss:Name="Carga Inventario"><Table>\n`;
        xml += `<Column ss:Width="150"/><Column ss:Width="100"/>\n`;
        xml += `<Row><Cell ss:StyleID="sH"><Data ss:Type="String">Clave</Data></Cell><Cell ss:StyleID="sH"><Data ss:Type="String">Existencia</Data></Cell></Row>\n`;

        for (const [clave, cant] of Object.entries(agrupados)) {
            const esc = clave.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            xml += `<Row><Cell ss:StyleID="sT"><Data ss:Type="String">${esc}</Data></Cell><Cell><Data ss:Type="Number">${Math.round(cant * 100) / 100}</Data></Cell></Row>\n`;
        }

        xml += `</Table></Worksheet></Workbook>`;

        res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(xml);
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// ─────────────────────────────────────────────────
// LIST pending remisiones
// ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const sql = `SELECT hr.id, hr.numero_remision, hr.proveedor, hr.fecha_carga, hr.estado, 
                     (SELECT COUNT(*) FROM historial_items WHERE remision_id = hr.id) as items 
                     FROM historial_remisiones hr 
                     WHERE estado IN ('PENDIENTE', 'ENVIADO', 'REVISION') 
                     ORDER BY fecha_carga DESC`;
        const [rows] = await pool.execute(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// ─────────────────────────────────────────────────
// READ factura items (migrated from api_leer_factura.php)
// ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const remision_id = req.params.id;
        
        const [remision] = await pool.execute(`SELECT * FROM historial_remisiones WHERE id = ?`, [remision_id]);
        if (remision.length === 0) return res.status(404).json({ success: false, error: 'Remisión no encontrada' });

        // Exact same intelligent query as api_leer_factura.php
        const [items] = await pool.execute(`
            SELECT 
                hi.*, 
                -- Datos del Catálogo (Sistema Actual)
                MAX(cp.precio_compra) as costo_bd, 
                MAX(cp.precio_venta) as venta_bd,
                MAX(cp.descripcion) as desc_bd,
                MAX(cp.clave_sicar) as clave_catalogo,
                
                -- Datos de la Memoria (Tabla de Relaciones)
                MAX(rcp.clave_sicar) as clave_memoria,
                MAX(rcp.es_paquete) as es_paquete_mem,
                MAX(rcp.piezas_por_paquete) as piezas_mem
                
            FROM historial_items hi
            
            -- A. Consultamos la Memoria (Relación Proveedor -> SICAR)
            LEFT JOIN rel_codigos_proveedor rcp ON hi.codigo_proveedor = rcp.codigo_proveedor
            
            -- B. Consultamos el Catálogo Maestro (Para precios y descripciones)
            LEFT JOIN cat_productos cp ON (
                (hi.clave_final IS NOT NULL AND hi.clave_final != '' AND cp.clave_sicar = hi.clave_final) 
                OR 
                (hi.clave_sicar IS NOT NULL AND hi.clave_sicar != '' AND cp.clave_sicar = hi.clave_sicar)
                OR
                (rcp.clave_sicar IS NOT NULL AND cp.clave_sicar = rcp.clave_sicar)
                OR
                (hi.codigo_proveedor IS NOT NULL AND hi.codigo_proveedor != '' AND cp.codigo_barras = hi.codigo_proveedor)
            )
            WHERE hi.remision_id = ?
            GROUP BY hi.id 
            ORDER BY hi.id ASC
        `, [remision_id]);

        // Group by remision code and build response like PHP does
        const folio = remision[0].numero_remision;
        const datos = {};
        datos[folio] = items.map(item => {
            // 1. Smart SICAR key resolution (same cascade as PHP)
            let claveSugerida = item.clave_final;
            if (!claveSugerida) claveSugerida = item.clave_sicar;
            if (!claveSugerida) claveSugerida = item.clave_memoria;
            if (!claveSugerida) claveSugerida = item.clave_catalogo;

            // 2. Smart package config (fall back to memory)
            let esPaquete = item.es_paquete;
            let piezas = item.piezas_por_paquete;
            if (esPaquete === null && item.es_paquete_mem !== null) {
                esPaquete = item.es_paquete_mem;
                piezas = item.piezas_mem;
            }

            return {
                id: item.id,
                cod_prov: item.codigo_proveedor,
                desc: item.descripcion_original,
                desc_sistema: item.desc_bd || null,
                cant: parseFloat(item.cantidad) || 0,
                costo: parseFloat(item.costo_unitario) || 0,
                costo_bruto: parseFloat(item.costo_unitario) || 0,
                es_paquete: esPaquete,
                piezas_por_paquete: piezas,
                clave_final: item.clave_final,
                clave_sicar: claveSugerida,
                existencia_lapiz: item.existencia_lapiz,
                aplica_iva: item.aplica_iva,
                aplica_descuento: item.aplica_descuento,
                aplica_descuento_manual: item.aplica_descuento_manual != null ? item.aplica_descuento_manual : null,
                revision_pendiente: item.revision_pendiente,
                costo_unitario: parseFloat(item.costo_unitario) || 0,
                costo_sistema_actual: item.costo_bd != null ? parseFloat(item.costo_bd) : 0,
                precio_venta_sistema: item.venta_bd != null ? parseFloat(item.venta_bd) : 0
            };
        });

        res.json({ success: true, datos, estado: remision[0].estado, proveedor: remision[0].proveedor });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// ─────────────────────────────────────────────────
// UPDATE a specific field (expanded allowed fields)
// ─────────────────────────────────────────────────
router.post('/actualizar_campo', authorize({ module: 'recepciones', action: 'write' }), async (req, res) => {
    const { id_item, campo, valor } = req.body;
    if (!id_item || !campo) return res.status(400).json({ success: false, error: 'Faltan parámetros' });

    const allowedFields = [
        'existencia_lapiz', 'clave_final', 'es_paquete', 'piezas_por_paquete',
        'costo_unitario', 'aplica_descuento', 'aplica_descuento_manual',
        'cantidad', 'revision_pendiente', 'cantidad_real'
    ];
    if (!allowedFields.includes(campo)) return res.status(400).json({ success: false, error: 'Campo no permitido' });

    // Map frontend field names to actual DB column names if needed
    let dbField = campo;
    if (campo === 'cantidad_real') dbField = 'cantidad';

    try {
        await pool.execute(`UPDATE historial_items SET \`${dbField}\` = ? WHERE id = ?`, [valor, id_item]);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// ─────────────────────────────────────────────────
// ASSIGN provider
// ─────────────────────────────────────────────────
router.post('/asignar_proveedor', authorize({ module: 'recepciones', action: 'write' }), async (req, res) => {
    const { id_remision, proveedor } = req.body;
    if (!id_remision || !proveedor) return res.status(400).json({ success: false, error: 'Faltan parámetros' });

    try {
        await pool.execute(`UPDATE historial_remisiones SET proveedor = ? WHERE id = ?`, [proveedor, id_remision]);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// ─────────────────────────────────────────────────
// FINALIZE remision
// ─────────────────────────────────────────────────
router.post('/finalizar', authorize({ module: 'recepciones', action: 'write' }), async (req, res) => {
    const { remision_id } = req.body;
    try {
        await pool.execute(`UPDATE historial_remisiones SET estado = 'FINALIZADO' WHERE numero_remision = ?`, [remision_id]);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// ─────────────────────────────────────────────────
// DELETE single item
// ─────────────────────────────────────────────────
router.delete('/item/:id', authorize({ module: 'recepciones', action: 'write' }), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute(`DELETE FROM historial_items WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});


// ─────────────────────────────────────────────────
// UPLOAD XML/CSV (migrated from api_guardar_borrador.php)
// ─────────────────────────────────────────────────

// Helper: Get or create remision
async function obtenerOcrearRemision(connection, folio, prov) {
    const [rows] = await connection.execute(
        `SELECT id FROM historial_remisiones WHERE numero_remision = ? LIMIT 1`,
        [folio]
    );

    if (rows.length > 0) {
        await connection.execute(
            `UPDATE historial_remisiones SET fecha_carga = NOW(), proveedor = ? WHERE id = ?`,
            [prov, rows[0].id]
        );
        return rows[0].id;
    }

    const [result] = await connection.execute(
        `INSERT INTO historial_remisiones (numero_remision, proveedor, fecha_carga, estado) VALUES (?, ?, NOW(), 'PENDIENTE')`,
        [folio, prov]
    );
    return result.insertId;
}

async function saveParsedReception(connection, parsed) {
    let ultimoId = 0;
    let ultimoProv = 'MANUAL';

    for (const remision of parsed.remisiones) {
        const idRem = await obtenerOcrearRemision(connection, remision.folio, remision.proveedor);
        ultimoId = idRem;
        ultimoProv = remision.proveedor;

        for (const item of remision.items) {
            const [existing] = await connection.execute(
                `SELECT id FROM historial_items WHERE remision_id = ? AND codigo_proveedor = ? LIMIT 1`,
                [idRem, item.codigo_proveedor]
            );

            if (existing.length > 0 && parsed.format === 'xml') {
                await connection.execute(
                    `UPDATE historial_items SET descripcion_original=?, cantidad=?, costo_unitario=?, aplica_descuento=? WHERE id=?`,
                    [item.descripcion_original, item.cantidad, item.costo_unitario, item.aplica_descuento, existing[0].id]
                );
            } else if (existing.length > 0) {
                await connection.execute(
                    `UPDATE historial_items SET descripcion_original=?, cantidad=?, costo_unitario=? WHERE id=?`,
                    [item.descripcion_original, item.cantidad, item.costo_unitario, existing[0].id]
                );
            } else if (parsed.format === 'xml') {
                await connection.execute(
                    `INSERT INTO historial_items (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) VALUES (?, ?, ?, ?, ?, 0, 0, 1, 0, ?)`,
                    [idRem, item.codigo_proveedor, item.descripcion_original, item.cantidad, item.costo_unitario, item.aplica_descuento]
                );
            } else {
                await connection.execute(
                    `INSERT INTO historial_items (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 0)`,
                    [idRem, item.codigo_proveedor, item.descripcion_original, item.cantidad, item.costo_unitario, item.existencia_lapiz]
                );
            }
        }
    }

    return { id: ultimoId, prov: ultimoProv };
}

router.post('/upload', authorize({ module: 'recepciones', action: 'write' }), receiveUpload, async (req, res) => {
    let connection;
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se subio ningun archivo' });
        }

        const parsed = await parseUpload({ file: req.file, maxRows: 10_000 });
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const result = await saveParsedReception(connection, parsed);
        await connection.commit();

        res.json({
            success: true,
            mensaje: 'Procesado correctamente.',
            id_remision: result.id,
            proveedor: result.prov
        });

    } catch (error) {
        await rollbackTransaction(connection, req.requestId);
        if (error instanceof UploadValidationError) {
            return res.status(error.statusCode).json({ success: false, error: error.message });
        }
        return sendInternalError(error, req, res);
    } finally {
        releaseConnection(connection, req.requestId);
    }
});

module.exports = router;
