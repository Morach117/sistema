const fs = require('node:fs/promises');
const path = require('node:path');
const xml2js = require('xml2js');
const { parse } = require('csv-parse/sync');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
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

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  parseUpload,
  UploadValidationError
};
