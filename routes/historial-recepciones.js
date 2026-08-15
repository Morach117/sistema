const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize, denyAccess } = require('../middleware/authorize');
const { releaseConnection, rollbackTransaction, sendInternalError } = require('../middleware/errors');
const {
  assignReceptionProvider,
  buildInventoryExportRows,
  insertReceptionAuditEntry,
  ReceptionStateError,
  updateReceptionItem
} = require('../services/recepciones-service');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const ALLOWED_STATES = new Set(['PENDIENTE', 'ENVIADO', 'REVISION', 'FINALIZADO']);

function sendReceptionState(res, error) {
  const payload = { success: false, error: error.message };
  if (Array.isArray(error.details) && error.details.length > 0) {
    payload.details = error.details;
  }
  return res.status(error.statusCode).json(payload);
}

function requireHistoryAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return denyAccess(res);
  return next();
}

function parsePositiveInteger(value, { field, fallback = undefined } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new ReceptionStateError(`El parametro ${field} es obligatorio.`, 422);
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new ReceptionStateError(`El parametro ${field} no es valido.`, 422);
  }
  return normalized;
}

function parseOptionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReceptionStateError(`El parametro ${field} no tiene un formato de fecha valido.`, 422);
  }
  return value;
}

function parseIncludePhysicalFlag(value) {
  if (value === undefined) return false;
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  throw new ReceptionStateError('El parametro incluir_fisico debe ser booleano.', 422);
}

function buildHistoryFilters(query) {
  const clauses = [];
  const params = [];

  const fechaDesde = parseOptionalDate(query.fecha_desde, 'fecha_desde');
  const fechaHasta = parseOptionalDate(query.fecha_hasta, 'fecha_hasta');
  if (fechaDesde) {
    clauses.push('DATE(hr.fecha_carga) >= ?');
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    clauses.push('DATE(hr.fecha_carga) <= ?');
    params.push(fechaHasta);
  }

  if (typeof query.proveedor === 'string' && query.proveedor.trim()) {
    clauses.push('hr.proveedor = ?');
    params.push(query.proveedor.trim());
  }

  if (typeof query.estado === 'string' && query.estado.trim()) {
    const estado = query.estado.trim().toUpperCase();
    if (!ALLOWED_STATES.has(estado)) {
      throw new ReceptionStateError('El parametro estado no es valido.', 422);
    }
    clauses.push('hr.estado = ?');
    params.push(estado);
  }

  if (typeof query.folio === 'string' && query.folio.trim()) {
    const folio = `%${query.folio.trim()}%`;
    clauses.push('(hr.numero_remision LIKE ? OR CAST(hr.id AS CHAR) LIKE ?)');
    params.push(folio, folio);
  }

  if (typeof query.producto === 'string' && query.producto.trim()) {
    const producto = `%${query.producto.trim()}%`;
    clauses.push(`EXISTS (
      SELECT 1
        FROM historial_items hi_filter
       WHERE hi_filter.remision_id = hr.id
         AND (
           hi_filter.descripcion_original LIKE ?
           OR hi_filter.codigo_proveedor LIKE ?
           OR COALESCE(hi_filter.clave_final, hi_filter.clave_sicar, '') LIKE ?
         )
    )`);
    params.push(producto, producto, producto);
  }

  return { clauses, params };
}

function historyPermissions(user, estado) {
  const editable = user?.rol === 'admin' && String(estado || '').toUpperCase() !== 'FINALIZADO';
  return {
    soloLectura: !editable,
    puedeEditar: editable,
    puedeExportar: editable
  };
}

function buildHistoryItemsPayload(items, folio) {
  const datos = {};
  datos[folio] = (Array.isArray(items) ? items : []).map((item) => {
    let claveSugerida = item.clave_final;
    if (!claveSugerida) claveSugerida = item.clave_sicar;
    if (!claveSugerida) claveSugerida = item.clave_memoria;
    if (!claveSugerida) claveSugerida = item.clave_catalogo;

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
      cant: Number.parseFloat(item.cantidad) || 0,
      costo: Number.parseFloat(item.costo_unitario) || 0,
      costo_bruto: Number.parseFloat(item.costo_unitario) || 0,
      es_paquete: esPaquete,
      piezas_por_paquete: piezas,
      clave_final: item.clave_final,
      clave_sicar: claveSugerida,
      existencia_lapiz: item.existencia_lapiz,
      aplica_iva: item.aplica_iva,
      iva_tasa: item.iva_tasa != null ? Number.parseFloat(item.iva_tasa) : null,
      costo_incluye_iva: item.costo_incluye_iva,
      aplica_descuento: item.aplica_descuento,
      aplica_descuento_manual: item.aplica_descuento_manual != null ? item.aplica_descuento_manual : null,
      revision_pendiente: item.revision_pendiente,
      costo_unitario: Number.parseFloat(item.costo_unitario) || 0,
      costo_sistema_actual: item.costo_bd != null ? Number.parseFloat(item.costo_bd) : 0,
      precio_venta_sistema: item.venta_bd != null ? Number.parseFloat(item.venta_bd) : 0
    };
  });
  return datos;
}

router.use(authMiddleware);
router.use(authorize({ module: 'historial-recepciones', action: 'read' }));

router.get('/', async (req, res) => {
  try {
    const pagina = parsePositiveInteger(req.query.page, { field: 'page', fallback: 1 });
    const requestedLimit = parsePositiveInteger(req.query.limit, { field: 'limit', fallback: DEFAULT_PAGE_SIZE });
    const limite = Math.min(requestedLimit, MAX_PAGE_SIZE);
    const offset = (pagina - 1) * limite;
    const { clauses, params } = buildHistoryFilters(req.query);
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM historial_remisiones hr ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await pool.execute(
      `SELECT hr.id, hr.numero_remision, hr.proveedor, hr.fecha_carga, hr.estado,
              COUNT(hi.id) AS items
         FROM historial_remisiones hr
         LEFT JOIN historial_items hi ON hi.remision_id = hr.id
         ${whereSql}
        GROUP BY hr.id
        ORDER BY hr.fecha_carga DESC, hr.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limite, offset]
    );

    res.json({
      success: true,
      data: rows,
      paginacion: {
        pagina,
        limite,
        total,
        totalPaginas: Math.max(1, Math.ceil(total / limite))
      }
    });
  } catch (error) {
    if (error instanceof ReceptionStateError) {
      return sendReceptionState(res, error);
    }
    return sendInternalError(error, req, res);
  }
});

router.post('/actualizar_campo', authorize({ module: 'recepciones', action: 'write' }), requireHistoryAdmin, async (req, res) => {
  const { id_item, campo, valor } = req.body;
  if (!id_item || !campo) return res.status(400).json({ success: false, error: 'Faltan parámetros' });

  let dbField = campo;
  if (campo === 'cantidad_real') dbField = 'cantidad';

  try {
    await updateReceptionItem({
      pool,
      itemId: id_item,
      field: dbField,
      value: valor,
      actorId: req.user?.id
    });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ReceptionStateError) {
      return sendReceptionState(res, error);
    }
    return sendInternalError(error, req, res);
  }
});

router.post('/asignar_proveedor', authorize({ module: 'recepciones', action: 'write' }), requireHistoryAdmin, async (req, res) => {
  const { id_remision, proveedor } = req.body;
  if (!id_remision || !proveedor) return res.status(400).json({ success: false, error: 'Faltan parámetros' });

  try {
    await assignReceptionProvider({
      pool,
      remisionId: id_remision,
      proveedor,
      actorId: req.user?.id
    });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ReceptionStateError) {
      return sendReceptionState(res, error);
    }
    return sendInternalError(error, req, res);
  }
});

router.post('/:id/notas', authorize({ module: 'recepciones', action: 'write' }), requireHistoryAdmin, async (req, res) => {
  let connection;
  try {
    const remisionId = parsePositiveInteger(req.params.id, { field: 'id' });
    const note = typeof req.body?.nota === 'string' ? req.body.nota.trim() : '';
    if (!note) {
      throw new ReceptionStateError('La nota no es valida.', 422);
    }
    const itemId = req.body?.item_id === undefined || req.body?.item_id === null || req.body?.item_id === ''
      ? null
      : parsePositiveInteger(req.body.item_id, { field: 'item_id' });

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [remisionRows] = await connection.execute(
      'SELECT id, estado, numero_remision FROM historial_remisiones WHERE id = ? FOR UPDATE',
      [remisionId]
    );
    if (!Array.isArray(remisionRows) || remisionRows.length !== 1) {
      throw new ReceptionStateError('La remision no existe.', 404);
    }
    if (String(remisionRows[0].estado).toUpperCase() === 'FINALIZADO') {
      throw new ReceptionStateError('La remision finalizada es de solo lectura.', 409);
    }

    if (itemId !== null) {
      const [itemRows] = await connection.execute(
        'SELECT id FROM historial_items WHERE id = ? AND remision_id = ? FOR UPDATE',
        [itemId, remisionId]
      );
      if (!Array.isArray(itemRows) || itemRows.length !== 1) {
        throw new ReceptionStateError('El item no existe en la remision.', 404);
      }
    }

    const [noteResult] = await connection.execute(
      'INSERT INTO recepcion_notas (remision_id, item_id, nota, creado_por) VALUES (?, ?, ?, ?)',
      [remisionId, itemId, note, req.user?.id || 0]
    );

    await insertReceptionAuditEntry(connection, {
      remisionId,
      itemId,
      actorId: req.user?.id,
      field: 'nota',
      previousValue: null,
      nextValue: note
    });

    await connection.commit();
    res.json({ success: true, id: noteResult.insertId });
  } catch (error) {
    await rollbackTransaction(connection, req.requestId);
    if (error instanceof ReceptionStateError) {
      return sendReceptionState(res, error);
    }
    return sendInternalError(error, req, res);
  } finally {
    releaseConnection(connection, req.requestId);
  }
});

router.get('/:id/excel', authorize({ module: 'recepciones', action: 'write' }), requireHistoryAdmin, async (req, res) => {
  try {
    const remisionId = parsePositiveInteger(req.params.id, { field: 'id' });
    const incluirFisico = parseIncludePhysicalFlag(req.query.incluir_fisico);

    const [remisionRows] = await pool.execute(
      'SELECT id, numero_remision, estado FROM historial_remisiones WHERE id = ? LIMIT 1',
      [remisionId]
    );
    if (!Array.isArray(remisionRows) || remisionRows.length !== 1) {
      throw new ReceptionStateError('La remision no existe.', 404);
    }
    if (String(remisionRows[0].estado).toUpperCase() === 'FINALIZADO') {
      throw new ReceptionStateError('La remision finalizada es de solo lectura y no admite exportacion.', 409);
    }

    const [items] = await pool.execute(
      `SELECT COALESCE(
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
        ORDER BY hi.id ASC`,
      [remisionId]
    );

    const exportRows = buildInventoryExportRows(items, { includePhysical: incluirFisico });
    const remisionClean = String(remisionRows[0].numero_remision || 'recepcion').replace(/[^A-Za-z0-9\-]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `Carga_Sicar_${remisionClean}_${today}.xls`;

    let xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n`;
    xml += `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n`;
    xml += `<Styles><Style ss:ID="sH"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2c3e50" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="sT"><NumberFormat ss:Format="@"/></Style></Styles>\n`;
    xml += `<Worksheet ss:Name="Carga Inventario"><Table>\n`;
    xml += `<Column ss:Width="150"/><Column ss:Width="100"/>\n`;
    xml += `<Row><Cell ss:StyleID="sH"><Data ss:Type="String">Clave</Data></Cell><Cell ss:StyleID="sH"><Data ss:Type="String">Existencia</Data></Cell></Row>\n`;

    for (const { clave, cantidad } of exportRows) {
      const escapedKey = String(clave).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      xml += `<Row><Cell ss:StyleID="sT"><Data ss:Type="String">${escapedKey}</Data></Cell><Cell><Data ss:Type="Number">${cantidad}</Data></Cell></Row>\n`;
    }

    xml += `</Table></Worksheet></Workbook>`;

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(xml);
  } catch (error) {
    if (error instanceof ReceptionStateError) {
      return sendReceptionState(res, error);
    }
    return sendInternalError(error, req, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const remisionId = parsePositiveInteger(req.params.id, { field: 'id' });

    const [remisionRows] = await pool.execute(
      `SELECT hr.id, hr.numero_remision, hr.proveedor, hr.fecha_carga, hr.estado,
              COUNT(hi.id) AS items
         FROM historial_remisiones hr
         LEFT JOIN historial_items hi ON hi.remision_id = hr.id
        WHERE hr.id = ?
        GROUP BY hr.id
        LIMIT 1`,
      [remisionId]
    );
    if (!Array.isArray(remisionRows) || remisionRows.length !== 1) {
      throw new ReceptionStateError('La remision no existe.', 404);
    }

    const remision = remisionRows[0];
    const [items] = await pool.execute(
      `SELECT hi.*,
              MAX(cp.precio_compra) AS costo_bd,
              MAX(cp.precio_venta) AS venta_bd,
              MAX(cp.descripcion) AS desc_bd,
              MAX(cp.clave_sicar) AS clave_catalogo,
              MAX(rcp.clave_sicar) AS clave_memoria,
              MAX(rcp.es_paquete) AS es_paquete_mem,
              MAX(rcp.piezas_por_paquete) AS piezas_mem
         FROM historial_items hi
         LEFT JOIN rel_codigos_proveedor rcp ON hi.codigo_proveedor = rcp.codigo_proveedor
         LEFT JOIN cat_productos cp ON (
            (hi.clave_final IS NOT NULL AND hi.clave_final != '' AND cp.clave_sicar = hi.clave_final)
            OR (hi.clave_sicar IS NOT NULL AND hi.clave_sicar != '' AND cp.clave_sicar = hi.clave_sicar)
            OR (rcp.clave_sicar IS NOT NULL AND cp.clave_sicar = rcp.clave_sicar)
            OR (hi.codigo_proveedor IS NOT NULL AND hi.codigo_proveedor != '' AND cp.codigo_barras = hi.codigo_proveedor)
         )
        WHERE hi.remision_id = ?
        GROUP BY hi.id
        ORDER BY hi.id ASC`,
      [remisionId]
    );
    const [notesRows] = await pool.execute(
      `SELECT n.id, n.remision_id, n.item_id, n.nota, n.creado_por AS usuario_id,
              COALESCE(NULLIF(u.nombre, ''), u.usuario, CONCAT('Usuario ', n.creado_por)) AS usuario,
              n.fecha
         FROM recepcion_notas n
         LEFT JOIN usuarios u ON u.id = n.creado_por
        WHERE n.remision_id = ?
        ORDER BY n.fecha DESC, n.id DESC`,
      [remisionId]
    );
    const [auditRows] = await pool.execute(
      `SELECT b.id, b.remision_id, b.item_id, b.usuario_id,
              COALESCE(NULLIF(u.nombre, ''), u.usuario, CONCAT('Usuario ', b.usuario_id)) AS usuario,
              b.campo, b.valor_anterior, b.valor_nuevo, b.fecha
         FROM recepcion_bitacora b
         LEFT JOIN usuarios u ON u.id = b.usuario_id
        WHERE b.remision_id = ?
        ORDER BY b.fecha DESC, b.id DESC`,
      [remisionId]
    );

    res.json({
      success: true,
      remision,
      estado: remision.estado,
      proveedor: remision.proveedor,
      datos: buildHistoryItemsPayload(items, remision.numero_remision),
      notas: notesRows,
      bitacora: auditRows,
      permisos: historyPermissions(req.user, remision.estado)
    });
  } catch (error) {
    if (error instanceof ReceptionStateError) {
      return sendReceptionState(res, error);
    }
    return sendInternalError(error, req, res);
  }
});

module.exports = router;
