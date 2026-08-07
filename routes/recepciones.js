const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const xml2js = require('xml2js');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const path = require('path');

const upload = multer({ dest: 'uploads/' });
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

// ─────────────────────────────────────────────────
// GENERATE EXCEL — BEFORE auth middleware (uses form POST, no Bearer header)
// Validates token from body/query instead
// ─────────────────────────────────────────────────
router.post('/generar_excel', async (req, res) => {
    // Inline token validation (form submissions can't send Authorization header)
    const token = req.body.token || req.query.token;
    if (token) {
        try { jwt.verify(token, JWT_SECRET); } catch (e) {
            return res.status(401).send('Token inválido');
        }
    }

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
        console.error('Error generating Excel:', error);
        res.status(500).send('Error interno al generar Excel: ' + error.message);
    }
});

router.use(authMiddleware);

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
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
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
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────
// UPDATE a specific field (expanded allowed fields)
// ─────────────────────────────────────────────────
router.post('/actualizar_campo', async (req, res) => {
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
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────
// ASSIGN provider
// ─────────────────────────────────────────────────
router.post('/asignar_proveedor', async (req, res) => {
    const { id_remision, proveedor } = req.body;
    if (!id_remision || !proveedor) return res.status(400).json({ success: false, error: 'Faltan parámetros' });

    try {
        await pool.execute(`UPDATE historial_remisiones SET proveedor = ? WHERE id = ?`, [proveedor, id_remision]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────
// FINALIZE remision
// ─────────────────────────────────────────────────
router.post('/finalizar', async (req, res) => {
    const { remision_id } = req.body;
    try {
        await pool.execute(`UPDATE historial_remisiones SET estado = 'FINALIZADO' WHERE numero_remision = ?`, [remision_id]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────
// DELETE single item
// ─────────────────────────────────────────────────
router.delete('/item/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute(`DELETE FROM historial_items WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
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

// Helper: Process XML file
async function procesarXML(filePath, connection) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, attrkey: '$' });
    const result = await parser.parseStringPromise(content);

    // Navigate to the Comprobante node (handle namespace prefixes)
    let comprobante = result['cfdi:Comprobante'] || result['Comprobante'] || result;
    if (!comprobante || !comprobante.$) return null;

    const serie = comprobante.$.Serie || '';
    const folio = comprobante.$.Folio || '';
    const folioCompleto = (serie + folio).toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Detect provider
    let emisorNode = comprobante['cfdi:Emisor'] || comprobante['Emisor'];
    if (!emisorNode) return null;
    if (Array.isArray(emisorNode)) emisorNode = emisorNode[0];

    const rfc = (emisorNode.$.Rfc || '').toUpperCase();
    const nombre = (emisorNode.$.Nombre || '').toUpperCase();

    let prov = 'MANUAL';
    if (rfc === 'TTI961202IM1' || nombre.includes('TONY')) prov = 'TONY';
    else if (rfc === 'LOVM900722BD8' || nombre.includes('PAOLA')) prov = 'PAOLA';
    else if (rfc === 'OTV801119HU2' || nombre.includes('OPTIVOSA')) prov = 'OPTIVOSA';
    else if (nombre.includes('OPERADORA')) prov = 'PAOLA';
    else if (rfc === 'GME191105I5A' || nombre.includes('MEGAMER')) prov = 'MEGAMER';

    const idRem = await obtenerOcrearRemision(connection, folioCompleto, prov);

    // Extract concepts
    let conceptosNode = comprobante['cfdi:Conceptos'] || comprobante['Conceptos'];
    if (!conceptosNode) return { id: idRem, prov };

    let conceptos = conceptosNode['cfdi:Concepto'] || conceptosNode['Concepto'];
    if (!Array.isArray(conceptos)) conceptos = [conceptos];

    for (const c of conceptos) {
        if (!c || !c.$) continue;
        const cod = c.$.NoIdentificacion || '';
        const desc = c.$.Descripcion || '';
        let cant = parseFloat(c.$.Cantidad) || 0;
        let costo = parseFloat(c.$.ValorUnitario) || 0;

        // Process taxes (IVA)
        let impuestosNode = c['cfdi:Impuestos'] || c['Impuestos'];
        if (impuestosNode) {
            let trasladosNode = impuestosNode['cfdi:Traslados'] || impuestosNode['Traslados'];
            if (trasladosNode) {
                let traslados = trasladosNode['cfdi:Traslado'] || trasladosNode['Traslado'];
                if (!Array.isArray(traslados)) traslados = [traslados];
                for (const t of traslados) {
                    if (t && t.$ && t.$.Impuesto === '002' && parseFloat(t.$.TasaOCuota) > 0) {
                        costo *= (1 + parseFloat(t.$.TasaOCuota));
                    }
                }
            }
        }

        const montoDesc = parseFloat(c.$.Descuento) || 0;
        const traeDescuentoXML = montoDesc > 0 ? 1 : 0;

        // Upsert: check if item already exists
        const [existing] = await connection.execute(
            `SELECT id FROM historial_items WHERE remision_id = ? AND codigo_proveedor = ? LIMIT 1`,
            [idRem, cod]
        );

        if (existing.length > 0) {
            await connection.execute(
                `UPDATE historial_items SET descripcion_original=?, cantidad=?, costo_unitario=?, aplica_descuento=? WHERE id=?`,
                [desc, cant, costo, traeDescuentoXML, existing[0].id]
            );
        } else {
            await connection.execute(
                `INSERT INTO historial_items (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) VALUES (?, ?, ?, ?, ?, 0, 0, 1, 0, ?)`,
                [idRem, cod, desc, cant, costo, traeDescuentoXML]
            );
        }
    }

    return { id: idRem, prov };
}

// Helper: Process CSV file
async function procesarCSV(filePath, connection) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let records;
    try {
        records = parse(content, { skip_empty_lines: true, relax_column_count: true });
    } catch (e) {
        console.error('CSV parse error:', e);
        return null;
    }

    const cacheRem = {};
    let ultimoId = 0;

    for (const r of records) {
        if (!r[0] || r[0].toLowerCase().includes('remision')) continue;

        const remTxt = r[0].toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (!cacheRem[remTxt]) {
            cacheRem[remTxt] = await obtenerOcrearRemision(connection, remTxt, 'MANUAL');
        }
        const idRem = cacheRem[remTxt];
        ultimoId = idRem;

        const cod = (r[1] || '').trim();
        const desc = (r[2] || '').trim();
        const cantidad = parseFloat((r[3] || '0').replace(',', '')) || 0;
        const costo = parseFloat((r[4] || '0').replace(/[$,]/g, '')) || 0;
        const exis = r[5] ? parseFloat(r[5].replace(',', '')) || 0 : 0;

        const [existing] = await connection.execute(
            `SELECT id FROM historial_items WHERE remision_id = ? AND codigo_proveedor = ? LIMIT 1`,
            [idRem, cod]
        );

        if (existing.length > 0) {
            await connection.execute(
                `UPDATE historial_items SET descripcion_original=?, cantidad=?, costo_unitario=? WHERE id=?`,
                [desc, cantidad, costo, existing[0].id]
            );
        } else {
            await connection.execute(
                `INSERT INTO historial_items (remision_id, codigo_proveedor, descripcion_original, cantidad, costo_unitario, existencia_lapiz, es_paquete, piezas_por_paquete, aplica_iva, aplica_descuento) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 0)`,
                [idRem, cod, desc, cantidad, costo, exis]
            );
        }
    }

    return { id: ultimoId, prov: 'MANUAL' };
}

router.post('/upload', upload.array('archivo_factura'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No se subió ningún archivo' });
        }

        await connection.beginTransaction();

        let ultimoId = 0;
        let ultimoProv = 'MANUAL';

        for (const file of req.files) {
            const ext = path.extname(file.originalname).toLowerCase();
            let result = null;

            if (ext === '.xml') {
                result = await procesarXML(file.path, connection);
            } else if (ext === '.csv') {
                result = await procesarCSV(file.path, connection);
            }

            if (result) {
                ultimoId = result.id;
                ultimoProv = result.prov;
            }

            // Clean up temp file
            try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
        }

        await connection.commit();

        res.json({
            success: true,
            mensaje: 'Procesado correctamente.',
            id_remision: ultimoId,
            proveedor: ultimoProv
        });

    } catch (error) {
        await connection.rollback();
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
