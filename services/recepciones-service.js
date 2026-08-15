const fs = require('node:fs/promises');
const path = require('node:path');
const xml2js = require('xml2js');
const { parse } = require('csv-parse/sync');
const { providerFrom } = require('./reception-rules');
const { buildReceptionSummary, validateReceptionItems } = require('./reception-rules');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_FILES = 5;
const MAX_TOTAL_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = {
  '.csv': new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain']),
  '.xml': new Set(['application/xml', 'text/xml'])
};

class UploadValidationError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.name = 'UploadValidationError';
    this.statusCode = statusCode;
  }
}

function numeric(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function truthyFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((numeric(value) + Number.EPSILON) * factor) / factor;
}

function validateFile(file) {
  if (!file || typeof file.path !== 'string' || typeof file.originalname !== 'string') {
    throw new UploadValidationError('No se recibio un archivo valido.');
  }

  const extension = path.extname(path.basename(file.originalname)).toLowerCase();
  const allowedMimeTypes = ALLOWED_MIME_TYPES[extension];
  if (!allowedMimeTypes || !allowedMimeTypes.has((file.mimetype || '').toLowerCase())) {
    throw new UploadValidationError('Solo se aceptan archivos XML o CSV validos.');
  }
  return extension;
}

function assertMaxRows(content, extension, maxRows) {
  if (!Number.isInteger(maxRows) || maxRows <= 0) {
    throw new UploadValidationError('El limite de filas no es valido.');
  }

  let rows;
  if (extension === '.csv') {
    rows = content.split(/\r\n|\n|\r/).filter((line) => line.trim()).length;
  } else {
    rows = (content.match(/<(?:[A-Za-z_][\w.-]*:)?Concepto(?:\s|\/?>)/g) || []).length;
  }

  if (rows > maxRows) {
    throw new UploadValidationError(`El archivo excede el limite de ${maxRows} filas.`);
  }
}

function xmlItem(concepto, proveedorDetectado) {
  let cost = Number.parseFloat(concepto.$.ValorUnitario) || 0;
  let impuestos = concepto['cfdi:Impuestos'] || concepto.Impuestos;
  if (Array.isArray(impuestos)) impuestos = impuestos[0];
  let trasladosNode = impuestos?.['cfdi:Traslados'] || impuestos?.Traslados;
  if (Array.isArray(trasladosNode)) trasladosNode = trasladosNode[0];
  let traslados = trasladosNode?.['cfdi:Traslado'] || trasladosNode?.Traslado || [];
  if (!Array.isArray(traslados)) traslados = [traslados];
  let ivaDetectado = 0;

  for (const traslado of traslados) {
    const rate = Number.parseFloat(traslado?.$.TasaOCuota);
    if (traslado?.$.Impuesto === '002' && rate > 0) {
      ivaDetectado = Math.max(ivaDetectado, rate);
      cost *= (1 + rate);
    }
  }

  const aplicaDescuento = (Number.parseFloat(concepto.$.Descuento) || 0) > 0 ? 1 : 0;
  const appliesIva = ivaDetectado > 0 ? 1 : 0;

  return {
    codigo_proveedor: concepto.$.NoIdentificacion || '',
    descripcion_original: concepto.$.Descripcion || '',
    cantidad: Number.parseFloat(concepto.$.Cantidad) || 0,
    costo_unitario: Math.round((cost + Number.EPSILON) * 100) / 100,
    existencia_lapiz: 0,
    aplica_iva: appliesIva,
    aplica_descuento: aplicaDescuento,
    source: {
      tipo: 'xml',
      proveedorDetectado,
      ivaDetectado,
      costoIncluyeIva: appliesIva === 1,
      descuentoPorConcepto: aplicaDescuento === 1
    }
  };
}

async function parseXml(content) {
  let document;
  try {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, attrkey: '$' });
    document = await parser.parseStringPromise(content);
  } catch (error) {
    throw new UploadValidationError('El XML no tiene un formato valido.');
  }

  const comprobante = document['cfdi:Comprobante'] || document.Comprobante || document;
  if (!comprobante?.$) throw new UploadValidationError('El XML no contiene un comprobante valido.');

  let emisor = comprobante['cfdi:Emisor'] || comprobante.Emisor;
  if (Array.isArray(emisor)) emisor = emisor[0];
  if (!emisor?.$) throw new UploadValidationError('El XML no contiene un emisor valido.');

  let conceptosNode = comprobante['cfdi:Conceptos'] || comprobante.Conceptos;
  if (Array.isArray(conceptosNode)) conceptosNode = conceptosNode[0];
  let conceptos = conceptosNode?.['cfdi:Concepto'] || conceptosNode?.Concepto || [];
  if (!Array.isArray(conceptos)) conceptos = [conceptos];

  const serie = comprobante.$.Serie || '';
  const folio = comprobante.$.Folio || '';
  const proveedorDetectado = providerFrom(emisor);
  return {
    format: 'xml',
    remisiones: [{
      folio: `${serie}${folio}`.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      proveedor: proveedorDetectado,
      items: conceptos.filter((concepto) => concepto?.$).map((concepto) => xmlItem(concepto, proveedorDetectado))
    }]
  };
}

function parseCsv(content) {
  let records;
  try {
    records = parse(content, { skip_empty_lines: true, relax_column_count: true });
  } catch (error) {
    throw new UploadValidationError('El CSV no tiene un formato valido.');
  }

  const remisiones = new Map();
  for (const row of records) {
    if (!row[0] || row[0].toLowerCase().includes('remision')) continue;

    const folio = row[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!remisiones.has(folio)) {
      remisiones.set(folio, { folio, proveedor: 'MANUAL', items: [] });
    }
    remisiones.get(folio).items.push({
      codigo_proveedor: (row[1] || '').trim(),
      descripcion_original: (row[2] || '').trim(),
      cantidad: Number.parseFloat((row[3] || '0').replace(',', '')) || 0,
      costo_unitario: Number.parseFloat((row[4] || '0').replace(/[$,]/g, '')) || 0,
      existencia_lapiz: row[5] ? Number.parseFloat(row[5].replace(',', '')) || 0 : 0,
      aplica_descuento: 0
    });
  }

  return { format: 'csv', remisiones: [...remisiones.values()] };
}

async function parseUpload({ file, maxRows }) {
  try {
    const extension = validateFile(file);
    const stats = await fs.stat(file.path);
    if (!stats.isFile() || stats.size > MAX_UPLOAD_BYTES) {
      throw new UploadValidationError('El archivo excede el limite de 10 MB.', 413);
    }

    const content = await fs.readFile(file.path, 'utf8');
    assertMaxRows(content, extension, maxRows);
    return extension === '.xml' ? await parseXml(content) : parseCsv(content);
  } finally {
    if (file?.path) {
      try {
        await fs.unlink(file.path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
}

async function cleanupUploadedFiles(files) {
  await Promise.all((Array.isArray(files) ? files : []).map(async (file) => {
    if (!file?.path) return;
    try {
      await fs.unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
}

async function parseUploads({ files, maxRows }) {
  const selectedFiles = Array.isArray(files) ? files : [];
  try {
    if (selectedFiles.length === 0) {
      throw new UploadValidationError('No se recibieron archivos validos.', 400);
    }
    if (selectedFiles.length > MAX_UPLOAD_FILES) {
      throw new UploadValidationError(`Solo se permiten ${MAX_UPLOAD_FILES} archivos por carga.`);
    }
    let totalBytes = 0;
    for (const file of selectedFiles) {
      const size = Number.isFinite(file?.size) ? file.size : (await fs.stat(file.path)).size;
      totalBytes += size;
      if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new UploadValidationError('La carga completa excede el limite de 20 MB.', 413);
      }
    }

    const parsedFiles = [];
    let totalRows = 0;
    for (const file of selectedFiles) {
      const parsed = await parseUpload({ file, maxRows });
      totalRows += parsed.remisiones.reduce((sum, remision) => sum + remision.items.length, 0);
      if (totalRows > maxRows) {
        throw new UploadValidationError(`La carga excede el limite total de ${maxRows} filas.`);
      }
      parsedFiles.push(parsed);
    }
    return parsedFiles;
  } finally {
    await cleanupUploadedFiles(selectedFiles);
  }
}

class ReceptionStateError extends Error {
  constructor(message, statusCode, details = undefined) {
    super(message);
    this.name = 'ReceptionStateError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

const UPDATABLE_ITEM_FIELDS = new Set([
  'existencia_lapiz', 'clave_final', 'es_paquete', 'piezas_por_paquete',
  'costo_unitario', 'aplica_descuento', 'aplica_descuento_manual',
  'cantidad', 'revision_pendiente'
]);

async function updateReceptionItem({ pool, itemId, field, value }) {
  const normalizedItemId = Number(itemId);
  if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) {
    throw new ReceptionStateError('El item no es valido.', 422);
  }
  if (!UPDATABLE_ITEM_FIELDS.has(field)) {
    throw new ReceptionStateError('Campo no permitido.', 422);
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute(
      `SELECT hi.id, hr.estado
         FROM historial_items hi
         JOIN historial_remisiones hr ON hr.id = hi.remision_id
        WHERE hi.id = ?
        FOR UPDATE`,
      [normalizedItemId]
    );
    if (rows.length !== 1) {
      throw new ReceptionStateError('El item no existe.', 404);
    }
    if (String(rows[0].estado).toUpperCase() === 'FINALIZADO') {
      throw new ReceptionStateError('La remision ya esta finalizada y no admite cambios.', 409);
    }
    const [result] = await connection.execute(
      `UPDATE historial_items SET \`${field}\` = ? WHERE id = ?`,
      [value, normalizedItemId]
    );
    if (result.affectedRows !== 1) {
      throw new ReceptionStateError('El item cambio durante la actualizacion.', 409);
    }
    await connection.commit();
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection?.release();
  }
}

async function runLockedReceptionMutation({ pool, lockStatement, lockParameters, mutate }) {
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute(lockStatement, lockParameters);
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new ReceptionStateError('La remision o el item no existe.', 404);
    }
    if (String(rows[0].estado).toUpperCase() === 'FINALIZADO') {
      throw new ReceptionStateError('La remision ya esta finalizada y no admite cambios.', 409);
    }
    await mutate(connection, rows[0]);
    await connection.commit();
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection?.release();
  }
}

async function assignReceptionProvider({ pool, remisionId, proveedor }) {
  const id = Number(remisionId);
  if (!Number.isInteger(id) || id <= 0 || typeof proveedor !== 'string' || !proveedor.trim()) {
    throw new ReceptionStateError('Los datos del proveedor no son validos.', 422);
  }
  await runLockedReceptionMutation({
    pool,
    lockStatement: 'SELECT id, estado FROM historial_remisiones WHERE id = ? FOR UPDATE',
    lockParameters: [id],
    mutate: (connection) => connection.execute(
      'UPDATE historial_remisiones SET proveedor = ? WHERE id = ?',
      [proveedor.trim(), id]
    )
  });
}

async function deleteReceptionItem({ pool, itemId }) {
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ReceptionStateError('El item no es valido.', 422);
  }
  await runLockedReceptionMutation({
    pool,
    lockStatement: `SELECT hi.id, hr.estado
                      FROM historial_items hi
                      JOIN historial_remisiones hr ON hr.id = hi.remision_id
                     WHERE hi.id = ?
                     FOR UPDATE`,
    lockParameters: [id],
    mutate: (connection) => connection.execute('DELETE FROM historial_items WHERE id = ?', [id])
  });
}

function resolveReceptionKey(item) {
  return String(
    item?.clave_final
    || item?.clave_sicar
    || item?.clave_memoria
    || item?.clave_catalogo
    || ''
  ).trim().toUpperCase();
}

function validateFinalizationItems(items) {
  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
    const resolvedKey = resolveReceptionKey(item);
    if (!resolvedKey) return item;
    return {
      ...item,
      clave_final: item?.clave_final || null,
      clave_sicar: item?.clave_sicar || resolvedKey
    };
  });
  const issues = [...validateReceptionItems(normalizedItems)];

  for (const item of normalizedItems) {
    const itemId = item?.id ?? null;
    const clave = resolveReceptionKey(item);
    const rejected = Number(item?.revision_pendiente) === 2;
    const skippedPhysical = clave === 'FALTANTE' || clave === 'DEVOLUCION';

    if (!skippedPhysical && numeric(item?.existencia_lapiz) <= 0) {
      issues.push({ itemId, code: 'missing-physical-count', severity: 'error' });
    }
    if (rejected) {
      issues.push({ itemId, code: 'rejected-item', severity: 'error' });
    }
  }

  return issues.filter((issue) => issue.severity === 'error');
}

function classifyPreviewState(state) {
  const normalized = typeof state === 'string' ? state.trim().toUpperCase() : '';
  if (normalized === 'FINALIZADO') {
    return { clasificacion: 'folio-finalizado', estadoActual: normalized, puedeGuardar: false };
  }
  if (normalized) {
    return { clasificacion: 'actualiza-pendiente', estadoActual: normalized, puedeGuardar: true };
  }
  return { clasificacion: 'nuevo', estadoActual: null, puedeGuardar: true };
}

async function buildUploadPreview({ pool, parsedFiles }) {
  const preview = [];

  for (const parsed of Array.isArray(parsedFiles) ? parsedFiles : []) {
    for (const remision of parsed.remisiones || []) {
      const previewItems = remision.items.map((item) => ({
        ...item,
        proveedor: item?.proveedor || remision.proveedor
      }));
      const [rows] = await pool.execute(
        'SELECT id, estado FROM historial_remisiones WHERE numero_remision = ? LIMIT 1',
        [remision.folio]
      );
      const existing = rows[0] || null;
      preview.push({
        folio: remision.folio,
        proveedor: remision.proveedor,
        ...classifyPreviewState(existing?.estado),
        resumen: buildReceptionSummary(previewItems),
        issues: validateReceptionItems(previewItems),
        items: previewItems
      });
    }
  }

  return preview;
}

function buildInventoryExportRows(items, { includePhysical = false } = {}) {
  const grouped = {};

  for (const row of Array.isArray(items) ? items : []) {
    const clave = String(row?.clave_definitiva || 'SIN_CLAVE').trim().toUpperCase();
    if (clave === 'FALTANTE' || clave === 'DEVOLUCION') continue;

    const cantidadFacturada = numeric(row?.cantidad);
    const fisico = includePhysical ? numeric(row?.existencia_lapiz) : 0;
    const esPaquete = Number.parseInt(row?.es_paquete, 10) || 0;
    const piezasPorCaja = numeric(row?.piezas_por_paquete) || 1;
    const cantidadCalculada = (esPaquete === 1 && piezasPorCaja > 0)
      ? cantidadFacturada / piezasPorCaja
      : cantidadFacturada;

    grouped[clave] = (grouped[clave] || 0) + cantidadCalculada + fisico;
  }

  return Object.entries(grouped).map(([clave, cantidad]) => ({
    clave,
    cantidad: round(cantidad, 2)
  }));
}

async function learnReceptionRelationships(connection, items) {
  for (const item of Array.isArray(items) ? items : []) {
    const clave = resolveReceptionKey(item);
    if (!clave || clave === 'FALTANTE' || clave === 'DEVOLUCION') continue;
    if (Number(item?.revision_pendiente) === 2) continue;

    const codigoProveedor = String(item?.codigo_proveedor || '').trim();
    if (!codigoProveedor) continue;

    const esPaquete = truthyFlag(item?.es_paquete) ? 1 : 0;
    const piezasPorPaquete = esPaquete ? Math.max(1, numeric(item?.piezas_por_paquete)) : 1;

    await connection.execute(
      `INSERT INTO rel_codigos_proveedor (codigo_proveedor, clave_sicar, es_paquete, piezas_por_paquete)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         clave_sicar = VALUES(clave_sicar),
         es_paquete = VALUES(es_paquete),
         piezas_por_paquete = VALUES(piezas_por_paquete)`,
      [codigoProveedor, clave, esPaquete, piezasPorPaquete]
    );
  }
}

async function insertReceptionAudit(connection, { remisionId, actorId, previousValue, nextValue }) {
  await connection.execute(
    `INSERT INTO recepcion_bitacora (remision_id, item_id, usuario_id, campo, valor_anterior, valor_nuevo)
     VALUES (?, NULL, ?, 'estado', ?, ?)`,
    [remisionId, Number.isInteger(actorId) && actorId > 0 ? actorId : 0, previousValue, nextValue]
  );
}

async function finalizeReception({ pool, numeroRemision, actorId }) {
  if (typeof numeroRemision !== 'string' || !numeroRemision.trim()) {
    throw new ReceptionStateError('La remision no es valida.', 422);
  }
  const folio = numeroRemision.trim();
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.execute(
      'SELECT id, estado FROM historial_remisiones WHERE numero_remision = ? FOR UPDATE',
      [folio]
    );
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new ReceptionStateError('La remision o el item no existe.', 404);
    }
    if (String(rows[0].estado).toUpperCase() === 'FINALIZADO') {
      throw new ReceptionStateError('La remision ya esta finalizada y no admite cambios.', 409);
    }

    const [items] = await connection.execute(
      `SELECT hi.id, hi.codigo_proveedor, hi.clave_final, hi.clave_sicar,
              MAX(rcp.clave_sicar) AS clave_memoria, hi.cantidad,
              hi.costo_unitario, hi.existencia_lapiz, hi.revision_pendiente,
              hi.es_paquete, hi.piezas_por_paquete
         FROM historial_items hi
         LEFT JOIN rel_codigos_proveedor rcp ON hi.codigo_proveedor = rcp.codigo_proveedor
        WHERE hi.remision_id = ?
        GROUP BY hi.id
        ORDER BY hi.id ASC`,
      [rows[0].id]
    );

    const blockingIssues = validateFinalizationItems(items);
    if (blockingIssues.length > 0) {
      throw new ReceptionStateError(
        'La remision tiene errores bloqueantes y no se puede finalizar.',
        422,
        blockingIssues
      );
    }

    await learnReceptionRelationships(connection, items);
    await insertReceptionAudit(connection, {
      remisionId: rows[0].id,
      actorId,
      previousValue: rows[0].estado,
      nextValue: 'FINALIZADO'
    });
    await connection.execute(
      "UPDATE historial_remisiones SET estado = 'FINALIZADO' WHERE id = ?",
      [rows[0].id]
    );
    await connection.commit();
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection?.release();
  }
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  MAX_TOTAL_UPLOAD_BYTES,
  assignReceptionProvider,
  buildInventoryExportRows,
  buildUploadPreview,
  cleanupUploadedFiles,
  deleteReceptionItem,
  finalizeReception,
  parseUpload,
  parseUploads,
  ReceptionStateError,
  updateReceptionItem,
  UploadValidationError
};
