const path = require('path');
const XLSX = require('xlsx');

const MAX_CATALOG_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CATALOG_ROWS = 20_000;
const MAX_DECIMAL_VALUE = 99_999_999.99;

class CatalogImportError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.name = 'CatalogImportError';
    this.statusCode = statusCode;
  }
}

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const COLUMN_ALIASES = Object.freeze({
  clave_sicar: new Set(['clave', 'clave sicar', 'codigo', 'codigo sicar']),
  descripcion: new Set(['descripcion', 'nombre', 'producto']),
  precio_venta: new Set(['precio v', 'precio venta', 'precio venta publico', 'venta']),
  precio_compra: new Set(['precio c', 'precio compra', 'costo', 'costo unitario']),
  existencia: new Set(['exis', 'existencia', 'stock', 'inventario'])
});

function mapHeaderRow(row) {
  const positions = {};
  for (const [index, value] of row.entries()) {
    const header = normalizedText(value);
    if (!header) continue;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.has(header) && positions[field] === undefined) positions[field] = index;
    }
  }
  return positions;
}

function findHeader(rows) {
  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const positions = mapHeaderRow(rows[index]);
    if (positions.clave_sicar !== undefined && positions.descripcion !== undefined) {
      return { rowIndex: index, positions };
    }
  }
  throw new CatalogImportError('No encontré las columnas Clave y Descripción del reporte SICAR.');
}

function parseNumber(value, field, rowNumber) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  let text = String(value).trim().replace(/[$\s]/g, '');
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma !== -1 && dot !== -1) {
    text = comma > dot
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (comma !== -1) {
    text = text.replace(',', '.');
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_DECIMAL_VALUE) {
    throw new CatalogImportError(`El valor de ${field} en la fila ${rowNumber} no es válido.`);
  }
  return parsed;
}

function cell(row, positions, field) {
  const index = positions[field];
  return index === undefined ? null : row[index];
}

function parseCatalogWorkbook(buffer, filename = 'catalogo.xlsx') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new CatalogImportError('No se recibió un archivo de Excel válido.');
  }
  if (buffer.length > MAX_CATALOG_FILE_BYTES) {
    throw new CatalogImportError('El archivo supera el límite de 10 MB.', 413);
  }

  const extension = path.extname(path.basename(filename)).toLowerCase();
  if (!['.xlsx', '.xls'].includes(extension)) {
    throw new CatalogImportError('Selecciona un archivo Excel .xlsx o .xls.');
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch (_error) {
    throw new CatalogImportError('El archivo no tiene un formato de Excel válido.');
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    let header;
    try {
      header = findHeader(rows);
    } catch (error) {
      if (error instanceof CatalogImportError) continue;
      throw error;
    }

    const products = new Map();
    for (let index = header.rowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;
      const clave = String(cell(row, header.positions, 'clave_sicar') ?? '').trim();
      const descripcion = String(cell(row, header.positions, 'descripcion') ?? '').trim();

      // El reporte de Utilidad intercala encabezados de grupo (por ejemplo,
      // "PRECISIO") que no representan un producto porque no tienen clave.
      if (!clave) continue;
      // También agrega un pie de página por hoja: "Página N / N".
      if (/^p[aá]gina\s+\d+/i.test(clave)) continue;
      if (!descripcion) throw new CatalogImportError(`La fila ${rowNumber} debe incluir Descripción.`);
      if (clave.length > 50 || descripcion.length > 255) {
        throw new CatalogImportError(`La fila ${rowNumber} excede el tamaño permitido para clave o descripción.`);
      }

      products.set(clave, {
        clave_sicar: clave,
        codigo_barras: clave,
        descripcion,
        precio_venta: parseNumber(cell(row, header.positions, 'precio_venta'), 'Precio venta', rowNumber),
        precio_compra: parseNumber(cell(row, header.positions, 'precio_compra'), 'Precio compra', rowNumber),
        existencia: parseNumber(cell(row, header.positions, 'existencia'), 'Existencia', rowNumber)
      });
      if (products.size > MAX_CATALOG_ROWS) {
        throw new CatalogImportError(`El archivo excede el límite de ${MAX_CATALOG_ROWS.toLocaleString('es-MX')} productos.`);
      }
    }

    if (products.size === 0) throw new CatalogImportError('El reporte no contiene productos para importar.');
    return { products: [...products.values()], sheetName, headerRow: header.rowIndex + 1 };
  }

  throw new CatalogImportError('No encontré una hoja con el formato de reporte SICAR.');
}

async function saveCatalogProducts({ pool, products }) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (let index = 0; index < products.length; index += 500) {
      const chunk = products.slice(index, index + 500);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const parameters = chunk.flatMap((product) => [
        product.clave_sicar,
        product.codigo_barras,
        product.descripcion,
        product.precio_compra,
        product.precio_venta,
        product.existencia
      ]);
      await connection.execute(
        `INSERT INTO cat_productos (clave_sicar, codigo_barras, descripcion, precio_compra, precio_venta, existencia)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           descripcion = VALUES(descripcion),
           precio_compra = VALUES(precio_compra),
           precio_venta = VALUES(precio_venta),
           existencia = VALUES(existencia),
           codigo_barras = IF(codigo_barras IS NULL OR codigo_barras = '', VALUES(codigo_barras), codigo_barras)`,
        parameters
      );
    }

    await connection.commit();
    return { imported: products.length };
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection?.release();
  }
}

module.exports = {
  CatalogImportError,
  MAX_CATALOG_FILE_BYTES,
  MAX_CATALOG_ROWS,
  parseCatalogWorkbook,
  saveCatalogProducts
};
