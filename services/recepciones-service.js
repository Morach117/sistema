const fs = require('node:fs/promises');
const path = require('node:path');
const xml2js = require('xml2js');
const { parse } = require('csv-parse/sync');

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

function providerFrom(emisor) {
  const rfc = (emisor?.$.Rfc || '').toUpperCase();
  const nombre = (emisor?.$.Nombre || '').toUpperCase();

  if (rfc === 'TTI961202IM1' || nombre.includes('TONY')) return 'TONY';
  if (rfc === 'LOVM900722BD8' || nombre.includes('PAOLA')) return 'PAOLA';
  if (rfc === 'OTV801119HU2' || nombre.includes('OPTIVOSA')) return 'OPTIVOSA';
  if (nombre.includes('OPERADORA')) return 'PAOLA';
  if (rfc === 'GME191105I5A' || nombre.includes('MEGAMER')) return 'MEGAMER';
  return 'MANUAL';
}

function xmlItem(concepto) {
  let cost = Number.parseFloat(concepto.$.ValorUnitario) || 0;
  let impuestos = concepto['cfdi:Impuestos'] || concepto.Impuestos;
  if (Array.isArray(impuestos)) impuestos = impuestos[0];
  let trasladosNode = impuestos?.['cfdi:Traslados'] || impuestos?.Traslados;
  if (Array.isArray(trasladosNode)) trasladosNode = trasladosNode[0];
  let traslados = trasladosNode?.['cfdi:Traslado'] || trasladosNode?.Traslado || [];
  if (!Array.isArray(traslados)) traslados = [traslados];

  for (const traslado of traslados) {
    const rate = Number.parseFloat(traslado?.$.TasaOCuota);
    if (traslado?.$.Impuesto === '002' && rate > 0) cost *= (1 + rate);
  }

  return {
    codigo_proveedor: concepto.$.NoIdentificacion || '',
    descripcion_original: concepto.$.Descripcion || '',
    cantidad: Number.parseFloat(concepto.$.Cantidad) || 0,
    costo_unitario: cost,
    existencia_lapiz: 0,
    aplica_descuento: (Number.parseFloat(concepto.$.Descuento) || 0) > 0 ? 1 : 0
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
  return {
    format: 'xml',
    remisiones: [{
      folio: `${serie}${folio}`.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      proveedor: providerFrom(emisor),
      items: conceptos.filter((concepto) => concepto?.$).map(xmlItem)
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
  constructor(message, statusCode) {
    super(message);
    this.name = 'ReceptionStateError';
    this.statusCode = statusCode;
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

async function finalizeReception({ pool, numeroRemision }) {
  if (typeof numeroRemision !== 'string' || !numeroRemision.trim()) {
    throw new ReceptionStateError('La remision no es valida.', 422);
  }
  const folio = numeroRemision.trim();
  await runLockedReceptionMutation({
    pool,
    lockStatement: 'SELECT id, estado FROM historial_remisiones WHERE numero_remision = ? FOR UPDATE',
    lockParameters: [folio],
    mutate: (connection, row) => connection.execute(
      "UPDATE historial_remisiones SET estado = 'FINALIZADO' WHERE id = ?",
      [row.id]
    )
  });
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  MAX_TOTAL_UPLOAD_BYTES,
  assignReceptionProvider,
  cleanupUploadedFiles,
  deleteReceptionItem,
  finalizeReception,
  parseUpload,
  parseUploads,
  ReceptionStateError,
  updateReceptionItem,
  UploadValidationError
};
