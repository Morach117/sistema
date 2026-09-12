const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {
  CatalogImportError,
  parseCatalogWorkbook,
  saveCatalogProducts
} = require('../../services/catalog-import');

function sicarReportBuffer() {
  const rows = [
    ['Reporte de Inventario/Utilidad'],
    [],
    ['Departamento:', 'Todos'],
    ['Precio Venta:', '1'],
    [' Clave', 'Descripción', '', '', 'Precio V.', 'Precio C.', 'Margen %', 'Utilidad Uni.', 'Exis', 'Utilidad Total'],
    ['871', 'Abaco 6 Postes De Madera', '', '', '$ 75.00', '$ 58.00', '29.31', '$ 17.00', '13.0', '$ 221.00'],
    ['', 'PRECISIO'],
    ['7501214924999', 'Abaco Barrilito', '', '', '$ 36.00', '$ 26.14', '37.72', '$ 9.86', '0.0', '$ 0.00'],
    ['Página 1', ' / 1', '', '', 'Generado Por SICAR']
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'PaqueteArts');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('reads the SICAR Utilidad report without moving or renaming its columns', () => {
  const parsed = parseCatalogWorkbook(sicarReportBuffer(), 'Utilidad.xlsx');

  assert.equal(parsed.sheetName, 'PaqueteArts');
  assert.equal(parsed.headerRow, 5);
  assert.deepEqual(parsed.products, [
    {
      clave_sicar: '871',
      codigo_barras: '871',
      descripcion: 'Abaco 6 Postes De Madera',
      precio_venta: 75,
      precio_compra: 58,
      existencia: 13
    },
    {
      clave_sicar: '7501214924999',
      codigo_barras: '7501214924999',
      descripcion: 'Abaco Barrilito',
      precio_venta: 36,
      precio_compra: 26.14,
      existencia: 0
    }
  ]);
});

test('explains when an uploaded spreadsheet is not a SICAR inventory report', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Producto', 'Cantidad'], ['Cuaderno', 1]]), 'Hoja1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(
    () => parseCatalogWorkbook(buffer, 'otro.xlsx'),
    (error) => error instanceof CatalogImportError && /formato de reporte SICAR/i.test(error.message)
  );
});

test('imports catalog rows in bounded transaction batches', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async execute(sql, parameters) { calls.push({ sql, parameters }); },
    async commit() { calls.push('commit'); },
    release() { calls.push('release'); }
  };
  const products = Array.from({ length: 501 }, (_, index) => ({
    clave_sicar: `SKU-${index}`,
    codigo_barras: `SKU-${index}`,
    descripcion: `Producto ${index}`,
    precio_compra: 10,
    precio_venta: 15,
    existencia: index
  }));

  const result = await saveCatalogProducts({ pool: { async getConnection() { return connection; } }, products });

  assert.deepEqual(result, { imported: 501 });
  const writes = calls.filter((call) => typeof call === 'object');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].parameters.length, 3_000);
  assert.equal(writes[1].parameters.length, 6);
  assert.match(writes[0].sql, /ON DUPLICATE KEY UPDATE/);
  assert.deepEqual(calls.filter((call) => typeof call === 'string'), ['begin', 'commit', 'release']);
});
