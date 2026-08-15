const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  MAX_TOTAL_UPLOAD_BYTES,
  assignReceptionProvider,
  deleteReceptionItem,
  finalizeReception,
  parseUpload,
  parseUploads,
  updateReceptionItem
} = require('../../services/recepciones-service');

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
    '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="urn:cfdi" Serie="A" Folio="12"><cfdi:Emisor Rfc="TTI961202IM1" Nombre="TONY"/><cfdi:Conceptos><cfdi:Concepto NoIdentificacion="SKU-2" Descripcion="Papel" Cantidad="3" ValorUnitario="4" Descuento="1"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" TasaOCuota="0.160000" /></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos></cfdi:Comprobante>',
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
        costo_unitario: 4.64,
        existencia_lapiz: 0,
        aplica_iva: 1,
        aplica_descuento: 1,
        source: {
          tipo: 'xml',
          proveedorDetectado: 'TONY',
          ivaDetectado: 0.16,
          costoIncluyeIva: true,
          descuentoPorConcepto: true
        }
      }]
    }]
  });
  await assert.rejects(() => fs.access(upload.file.path), { code: 'ENOENT' });
});

test('removes every temporary file when one file in a bounded batch is invalid', async (t) => {
  const first = await temporaryUpload(
    'valid.csv',
    'REMISION,CODIGO,DESCRIPCION,CANTIDAD,COSTO\nR-1,SKU-1,Uno,1,1\n',
    'text/csv'
  );
  const second = await temporaryUpload('invalid.exe', 'bad', 'application/octet-stream');
  t.after(() => fs.rm(first.directory, { recursive: true, force: true }));
  t.after(() => fs.rm(second.directory, { recursive: true, force: true }));

  await assert.rejects(
    () => parseUploads({ files: [first.file, second.file], maxRows: 10 }),
    /XML|CSV/i
  );
  await assert.rejects(() => fs.access(first.file.path), { code: 'ENOENT' });
  await assert.rejects(() => fs.access(second.file.path), { code: 'ENOENT' });
});

test('rejects aggregate upload size before parsing and removes the full batch', async (t) => {
  const first = await temporaryUpload('one.csv', 'a', 'text/csv');
  const second = await temporaryUpload('two.csv', 'b', 'text/csv');
  first.file.size = MAX_TOTAL_UPLOAD_BYTES;
  second.file.size = 1;
  t.after(() => fs.rm(first.directory, { recursive: true, force: true }));
  t.after(() => fs.rm(second.directory, { recursive: true, force: true }));

  await assert.rejects(
    () => parseUploads({ files: [first.file, second.file], maxRows: 10 }),
    (error) => error.statusCode === 413
  );
  await assert.rejects(() => fs.access(first.file.path), { code: 'ENOENT' });
  await assert.rejects(() => fs.access(second.file.path), { code: 'ENOENT' });
});

test('rejects receipt item updates after the parent remision is finalized', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) {
      events.push(['execute', sql, params]);
      return [[{ id: 8, estado: 'FINALIZADO' }], []];
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };

  await assert.rejects(
    () => updateReceptionItem({
      pool: { async getConnection() { return connection; } },
      itemId: 8,
      field: 'cantidad',
      value: 3
    }),
    (error) => error.statusCode === 409 && /finaliz/i.test(error.message)
  );
  assert.equal(events.includes('commit'), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});

test('updates a pending receipt item under the same row lock transaction', async () => {
  const events = [];
  const results = [
    [[{ id: 8, estado: 'PENDIENTE' }], []],
    [{ affectedRows: 1 }, []]
  ];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) { events.push(['execute', sql, params]); return results.shift(); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };

  await updateReceptionItem({
    pool: { async getConnection() { return connection; } },
    itemId: 8,
    field: 'cantidad',
    value: 3
  });

  assert.match(events[1][1], /FOR UPDATE/i);
  assert.deepEqual(events[2], ['execute', 'UPDATE historial_items SET `cantidad` = ? WHERE id = ?', [3, 8]]);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

function finalizedReceptionPool(lockRow = { id: 8, estado: 'FINALIZADO' }) {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) { events.push(['execute', sql, params]); return [[lockRow], []]; },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  return { events, async getConnection() { return connection; } };
}

for (const [label, mutate] of [
  ['provider assignment', (pool) => assignReceptionProvider({ pool, remisionId: 8, proveedor: 'TONY' })],
  ['item deletion', (pool) => deleteReceptionItem({ pool, itemId: 12 })],
  ['repeat finalization', (pool) => finalizeReception({ pool, numeroRemision: 'R-8' })]
]) {
  test(`rejects ${label} after locking a finalized parent`, async () => {
    const pool = finalizedReceptionPool();
    await assert.rejects(
      () => mutate(pool),
      (error) => error.statusCode === 409 && /finaliz/i.test(error.message)
    );
    assert.match(pool.events[1][1], /FOR UPDATE/i);
    assert.equal(pool.events.some((event) => Array.isArray(event) && /^(UPDATE|DELETE)/.test(event[1])), false);
    assert.deepEqual(pool.events.slice(-2), ['rollback', 'release']);
  });
}
