const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { parseUpload } = require('../../services/recepciones-service');

async function temporaryUpload(name, content, mimetype) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'recepcion-test-'));
  const filePath = path.join(directory, name);
  await fs.writeFile(filePath, content, 'utf8');
  return {
    directory,
    file: { path: filePath, originalname: name, mimetype }
  };
}

test('parses the accepted CSV format and removes the temporary file', async (t) => {
  const upload = await temporaryUpload(
    'recepcion.csv',
    'REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO,EXISTENCIA\nR-10,SKU-1,Lapiz,2,3.50,1\n',
    'text/csv'
  );
  t.after(() => fs.rm(upload.directory, { recursive: true, force: true }));

  const parsed = await parseUpload({ file: upload.file, maxRows: 10 });

  assert.deepEqual(parsed, {
    format: 'csv',
    remisiones: [{
      folio: 'R10',
      proveedor: 'MANUAL',
      items: [{
        codigo_proveedor: 'SKU-1',
        descripcion_original: 'Lapiz',
        cantidad: 2,
        costo_unitario: 3.5,
        existencia_lapiz: 1,
        aplica_descuento: 0
      }]
    }]
  });
  await assert.rejects(() => fs.access(upload.file.path), { code: 'ENOENT' });
});

test('rejects row counts before CSV parsing and still removes the temporary file', async (t) => {
  const upload = await temporaryUpload(
    'recepcion.csv',
    'R-1,SKU-1,Uno,1,1\nR-1,"unterminated\n',
    'text/csv'
  );
  t.after(() => fs.rm(upload.directory, { recursive: true, force: true }));

  await assert.rejects(
    () => parseUpload({ file: upload.file, maxRows: 1 }),
    (error) => error.statusCode === 422 && /filas/i.test(error.message)
  );
  await assert.rejects(() => fs.access(upload.file.path), { code: 'ENOENT' });
});

test('parses the accepted CFDI XML format and removes the temporary file', async (t) => {
  const upload = await temporaryUpload(
    'factura.xml',
    '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="urn:cfdi" Serie="A" Folio="12"><cfdi:Emisor Rfc="TTI961202IM1" Nombre="TONY"/><cfdi:Conceptos><cfdi:Concepto NoIdentificacion="SKU-2" Descripcion="Papel" Cantidad="3" ValorUnitario="4" Descuento="1"/></cfdi:Conceptos></cfdi:Comprobante>',
    'application/xml'
  );
  t.after(() => fs.rm(upload.directory, { recursive: true, force: true }));

  const parsed = await parseUpload({ file: upload.file, maxRows: 10 });

  assert.deepEqual(parsed, {
    format: 'xml',
    remisiones: [{
      folio: 'A12',
      proveedor: 'TONY',
      items: [{
        codigo_proveedor: 'SKU-2',
        descripcion_original: 'Papel',
        cantidad: 3,
        costo_unitario: 4,
        existencia_lapiz: 0,
        aplica_descuento: 1
      }]
    }]
  });
  await assert.rejects(() => fs.access(upload.file.path), { code: 'ENOENT' });
});
