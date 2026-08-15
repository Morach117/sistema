const test = require('node:test');
const assert = require('node:assert/strict');

const { createClientesService } = require('../../services/clientes-service');

const LOCAL_BRANCH_ID = '14c5c4e7-443c-42e9-b906-96cc704675ae';
const CLIENT_ID = '7b34f30e-31e8-44f5-9db3-d81220d10070';
const PURCHASE_ID = 'd78747e6-68f4-4d70-808b-6caae9154dac';
const OPERATION_ID = '8c2c2b82-da0d-4981-998d-93d5661ba23c';
const AUDIT_ID = '06a0eaf1-4a87-4e72-b8f8-c76f07c848cb';

function sqlText(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function mutationDatabase(execute) {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, parameters = []) {
      const normalized = sqlText(sql);
      events.push(['execute', normalized, parameters]);
      return execute(normalized, parameters);
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); }
  };
  return {
    events,
    async execute() { assert.fail('a mutation must use one transaction connection'); },
    async getConnection() { return connection; }
  };
}

function uuidSequence(...values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'requested more UUIDs than expected');
    return values[index++];
  };
}

function localConfigurationResult(sql) {
  if (/FROM cliente_configuracion WHERE alcance_local = 1 LIMIT 1 FOR UPDATE/i.test(sql)) {
    return [[{ sucursal_id: LOCAL_BRANCH_ID }], []];
  }
  return null;
}

function mutationInserts(events) {
  return events.filter((event) => Array.isArray(event) && /INSERT INTO cliente_(operaciones_sync|bitacora)/i.test(event[1]));
}

test('creates a client for the locally configured branch and atomically queues and audits the mutation', async () => {
  const database = mutationDatabase((sql) => {
    const configuration = localConfigurationResult(sql);
    if (configuration) return configuration;
    if (/INSERT INTO clientes /i.test(sql)) return [{ affectedRows: 1 }, []];
    if (/INSERT INTO cliente_(operaciones_sync|bitacora)/i.test(sql)) return [{ affectedRows: 1 }, []];
    assert.fail(`unexpected SQL: ${sql}`);
  });
  const service = createClientesService({
    database,
    createUuid: uuidSequence(CLIENT_ID, OPERATION_ID, AUDIT_ID)
  });

  const created = await service.createCliente({
    nombre: '  Ana López  ',
    telefono: ' 555-0101 ',
    correo: ' ANA@EXAMPLE.COM ',
    notas: ' Prefiere WhatsApp ',
    sucursal_id: '00000000-0000-4000-8000-000000000000',
    actorId: 17
  });

  assert.deepEqual(created, {
    id: CLIENT_ID,
    origen_sucursal_id: LOCAL_BRANCH_ID,
    nombre: 'Ana López',
    telefono: '555-0101',
    correo: 'ana@example.com',
    notas: 'Prefiere WhatsApp',
    activo: true,
    version: 1
  });
  const clientInsert = database.events.find((event) => Array.isArray(event) && /INSERT INTO clientes /i.test(event[1]));
  assert.equal(clientInsert[2][1], LOCAL_BRANCH_ID);
  assert.equal(clientInsert[2].includes('00000000-0000-4000-8000-000000000000'), false);

  const [queueInsert, auditInsert] = mutationInserts(database.events);
  assert.equal(queueInsert[2][0], OPERATION_ID);
  assert.equal(queueInsert[2][1], LOCAL_BRANCH_ID);
  assert.deepEqual(queueInsert[2].slice(2, 5), ['cliente', CLIENT_ID, 'crear']);
  assert.equal(auditInsert[2][0], AUDIT_ID);
  assert.equal(auditInsert[2][1], LOCAL_BRANCH_ID);
  assert.deepEqual(database.events.slice(-2), ['commit', 'release']);
  assert.ok(database.events.indexOf(queueInsert) < database.events.indexOf('commit'));
  assert.ok(database.events.indexOf(auditInsert) < database.events.indexOf('commit'));
});

test('edits an existing client with a new version without changing its origin branch', async () => {
  const database = mutationDatabase((sql) => {
    const configuration = localConfigurationResult(sql);
    if (configuration) return configuration;
    if (/FROM clientes WHERE id = \? FOR UPDATE/i.test(sql)) {
      return [[{
        id: CLIENT_ID,
        origen_sucursal_id: '8c91a40b-5c3f-4516-961e-b6a79ee2c40d',
        nombre: 'Ana',
        telefono: null,
        correo: null,
        notas: null,
        activo: 1,
        version: 4
      }], []];
    }
    if (/UPDATE clientes SET/i.test(sql)) return [{ affectedRows: 1 }, []];
    if (/INSERT INTO cliente_(operaciones_sync|bitacora)/i.test(sql)) return [{ affectedRows: 1 }, []];
    assert.fail(`unexpected SQL: ${sql}`);
  });
  const service = createClientesService({
    database,
    createUuid: uuidSequence(OPERATION_ID, AUDIT_ID)
  });

  const updated = await service.updateCliente({
    clienteId: CLIENT_ID,
    nombre: 'Ana López',
    telefono: '555-0102',
    actorId: 18,
    sucursal_id: '00000000-0000-4000-8000-000000000000'
  });

  assert.equal(updated.version, 5);
  assert.equal(updated.origen_sucursal_id, '8c91a40b-5c3f-4516-961e-b6a79ee2c40d');
  const update = database.events.find((event) => Array.isArray(event) && /UPDATE clientes SET/i.test(event[1]));
  assert.deepEqual(update[2], ['Ana López', '555-0102', null, null, 5, CLIENT_ID]);
  const [queueInsert] = mutationInserts(database.events);
  assert.equal(queueInsert[2][1], LOCAL_BRANCH_ID);
  assert.equal(queueInsert[2].includes('00000000-0000-4000-8000-000000000000'), false);
  assert.deepEqual(database.events.slice(-2), ['commit', 'release']);
});

test('deactivates rather than deletes a client and records the versioned mutation', async () => {
  const database = mutationDatabase((sql) => {
    const configuration = localConfigurationResult(sql);
    if (configuration) return configuration;
    if (/FROM clientes WHERE id = \? FOR UPDATE/i.test(sql)) {
      return [[{
        id: CLIENT_ID,
        origen_sucursal_id: LOCAL_BRANCH_ID,
        nombre: 'Ana López',
        telefono: null,
        correo: null,
        notas: null,
        activo: 1,
        version: 2
      }], []];
    }
    if (/UPDATE clientes SET activo = 0, version = \?/i.test(sql)) return [{ affectedRows: 1 }, []];
    if (/INSERT INTO cliente_(operaciones_sync|bitacora)/i.test(sql)) return [{ affectedRows: 1 }, []];
    assert.fail(`unexpected SQL: ${sql}`);
  });
  const service = createClientesService({
    database,
    createUuid: uuidSequence(OPERATION_ID, AUDIT_ID)
  });

  const deactivated = await service.deactivateCliente({ clienteId: CLIENT_ID, actorId: 19 });

  assert.equal(deactivated.activo, false);
  assert.equal(deactivated.version, 3);
  assert.equal(database.events.some((event) => Array.isArray(event) && /DELETE FROM clientes/i.test(event[1])), false);
  const [queueInsert, auditInsert] = mutationInserts(database.events);
  assert.equal(queueInsert[2][4], 'desactivar');
  assert.equal(auditInsert[2][5], 'desactivar');
  assert.deepEqual(database.events.slice(-2), ['commit', 'release']);
});

for (const scenario of [
  {
    name: 'with a ticket folio',
    folio: ' T-100 ',
    expectedFolio: 'T-100',
    date: '1000-01-01T00:00:00.000Z'
  },
  {
    name: 'without a ticket folio',
    folio: '   ',
    expectedFolio: null,
    date: '9999-12-31T23:59:59.999Z'
  }
]) {
  test(`registers a local purchase ${scenario.name} and atomically queues and audits it`, async () => {
    const database = mutationDatabase((sql) => {
      const configuration = localConfigurationResult(sql);
      if (configuration) return configuration;
      if (/SELECT id, activo FROM clientes WHERE id = \? FOR UPDATE/i.test(sql)) {
        return [[{ id: CLIENT_ID, activo: 1 }], []];
      }
      if (/INSERT INTO cliente_compras /i.test(sql)) return [{ affectedRows: 1 }, []];
      if (/INSERT INTO cliente_(operaciones_sync|bitacora)/i.test(sql)) return [{ affectedRows: 1 }, []];
      assert.fail(`unexpected SQL: ${sql}`);
    });
    const service = createClientesService({
      database,
      createUuid: uuidSequence(PURCHASE_ID, OPERATION_ID, AUDIT_ID)
    });

    const purchase = await service.registerPurchase({
      clienteId: CLIENT_ID,
      folio_ticket: scenario.folio,
      total: '125.50',
      detalle: [{ sku: 'P-1', cantidad: 2 }],
      fecha_compra: scenario.date,
      actorId: 20,
      sucursal_id: '00000000-0000-4000-8000-000000000000'
    });

    assert.equal(purchase.sucursal_id, LOCAL_BRANCH_ID);
    assert.equal(purchase.folio_ticket, scenario.expectedFolio);
    assert.equal(purchase.total, 125.5);
    assert.equal(purchase.fecha_compra, scenario.date);
    const purchaseInsert = database.events.find((event) => Array.isArray(event) && /INSERT INTO cliente_compras /i.test(event[1]));
    assert.deepEqual(purchaseInsert[2].slice(0, 4), [PURCHASE_ID, CLIENT_ID, LOCAL_BRANCH_ID, scenario.expectedFolio]);
    assert.equal(purchaseInsert[2].includes('00000000-0000-4000-8000-000000000000'), false);
    const [queueInsert, auditInsert] = mutationInserts(database.events);
    assert.equal(queueInsert[2][0], OPERATION_ID);
    assert.deepEqual(queueInsert[2].slice(1, 5), [LOCAL_BRANCH_ID, 'compra', PURCHASE_ID, 'crear']);
    assert.equal(auditInsert[2][0], AUDIT_ID);
    assert.deepEqual(database.events.slice(-2), ['commit', 'release']);
  });
}

test('rejects a duplicate ticket folio in the local branch and rolls back without queue or audit rows', async () => {
  const duplicateMessage = "Duplicate entry for key 'uq_cliente_compras_sucursal_folio'";
  const duplicateError = Object.assign(new Error(duplicateMessage), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlMessage: duplicateMessage
  });
  const database = mutationDatabase((sql) => {
    const configuration = localConfigurationResult(sql);
    if (configuration) return configuration;
    if (/SELECT id, activo FROM clientes WHERE id = \? FOR UPDATE/i.test(sql)) {
      return [[{ id: CLIENT_ID, activo: 1 }], []];
    }
    if (/INSERT INTO cliente_compras /i.test(sql)) throw duplicateError;
    assert.fail(`unexpected SQL after duplicate: ${sql}`);
  });
  const service = createClientesService({
    database,
    createUuid: uuidSequence(PURCHASE_ID)
  });

  await assert.rejects(
    () => service.registerPurchase({
      clienteId: CLIENT_ID,
      folio_ticket: 'T-100',
      total: 10,
      actorId: 20
    }),
    (error) => error.status === 409 && /folio/i.test(error.message)
  );

  assert.deepEqual(database.events.slice(-2), ['rollback', 'release']);
  assert.equal(mutationInserts(database.events).length, 0);
});

test('does not misreport a generated purchase UUID collision as a duplicate ticket folio', async () => {
  const duplicateUuid = Object.assign(new Error("Duplicate entry for key 'PRIMARY'"), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlMessage: "Duplicate entry for key 'PRIMARY'"
  });
  const database = mutationDatabase((sql) => {
    const configuration = localConfigurationResult(sql);
    if (configuration) return configuration;
    if (/SELECT id, activo FROM clientes WHERE id = \? FOR UPDATE/i.test(sql)) {
      return [[{ id: CLIENT_ID, activo: 1 }], []];
    }
    if (/INSERT INTO cliente_compras /i.test(sql)) throw duplicateUuid;
    assert.fail(`unexpected SQL after UUID collision: ${sql}`);
  });
  const service = createClientesService({
    database,
    createUuid: uuidSequence(PURCHASE_ID)
  });

  await assert.rejects(
    () => service.registerPurchase({ clienteId: CLIENT_ID, total: 10 }),
    (error) => error === duplicateUuid
  );
  assert.deepEqual(database.events.slice(-2), ['rollback', 'release']);
});

test('rejects a normalized invalid calendar purchase date before database access', async () => {
  const service = createClientesService({
    database: {
      async execute() { assert.fail('invalid dates must not query the database'); },
      async getConnection() { assert.fail('invalid dates must not start a transaction'); }
    }
  });

  await assert.rejects(
    () => service.registerPurchase({
      clienteId: CLIENT_ID,
      total: 10,
      fecha_compra: '2026-02-30T12:30:00.000Z'
    }),
    /fecha.*válida/i
  );
});

test('rejects a purchase date outside the MySQL DATETIME year range before database access', async () => {
  const service = createClientesService({
    database: {
      async execute() { assert.fail('out-of-range dates must not query the database'); },
      async getConnection() { assert.fail('out-of-range dates must not start a transaction'); }
    }
  });

  await assert.rejects(
    () => service.registerPurchase({
      clienteId: CLIENT_ID,
      total: 10,
      fecha_compra: '0999-12-31T23:59:59.999Z'
    }),
    /fecha.*válida/i
  );
});

test('rejects a purchase date without the supported explicit UTC timezone', async () => {
  const service = createClientesService({
    database: {
      async execute() { assert.fail('timezone-less dates must not query the database'); },
      async getConnection() { assert.fail('timezone-less dates must not start a transaction'); }
    }
  });

  await assert.rejects(
    () => service.registerPurchase({
      clienteId: CLIENT_ID,
      total: 10,
      fecha_compra: '2026-08-15T12:30:00.000'
    }),
    /fecha.*válida/i
  );
});

for (const failureTarget of ['queue', 'audit']) {
  test(`rolls back and releases when the ${failureTarget} insert fails after the client row insert`, async () => {
    const database = mutationDatabase((sql) => {
      const configuration = localConfigurationResult(sql);
      if (configuration) return configuration;
      if (/INSERT INTO clientes /i.test(sql)) return [{ affectedRows: 1 }, []];
      if (/INSERT INTO cliente_operaciones_sync/i.test(sql)) {
        if (failureTarget === 'queue') throw new Error('queue insert failed');
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO cliente_bitacora/i.test(sql)) throw new Error('audit insert failed');
      assert.fail(`unexpected SQL: ${sql}`);
    });
    const service = createClientesService({
      database,
      createUuid: uuidSequence(CLIENT_ID, OPERATION_ID, AUDIT_ID)
    });

    await assert.rejects(
      () => service.createCliente({ nombre: 'Ana', actorId: 17 }),
      new RegExp(`${failureTarget} insert failed`)
    );

    assert.ok(database.events.some((event) => Array.isArray(event) && /INSERT INTO clientes /i.test(event[1])));
    assert.equal(database.events.includes('commit'), false);
    assert.deepEqual(database.events.slice(-2), ['rollback', 'release']);
  });
}

test('lists clients with bounded pagination and a parameterized search across identifying fields', async () => {
  const executed = [];
  const database = {
    async getConnection() { assert.fail('read-only listing must not start a transaction'); },
    async execute(sql, parameters) {
      const normalized = sqlText(sql);
      executed.push([normalized, parameters]);
      if (/SELECT COUNT\(\*\) AS total FROM clientes/i.test(normalized)) return [[{ total: 135 }], []];
      if (/SELECT id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version/i.test(normalized)) {
        return [[{
          id: CLIENT_ID,
          origen_sucursal_id: LOCAL_BRANCH_ID,
          nombre: 'Ana López',
          telefono: '555-0101',
          correo: 'ana@example.com',
          notas: null,
          activo: 1,
          version: 3,
          creado_en: '2026-08-01 10:00:00',
          actualizado_en: '2026-08-15 11:00:00'
        }], []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    }
  };
  const service = createClientesService({ database });

  const result = await service.listClientes({ pagina: 2, limite: 500, buscar: "Ana%' OR 1=1 --", activo: 'todos' });

  assert.deepEqual(result.paginacion, { pagina: 2, limite: 100, total: 135, totalPaginas: 2 });
  assert.equal(result.data[0].activo, true);
  assert.equal(executed[0][0].includes("Ana%' OR 1=1 --"), false);
  assert.deepEqual(executed[0][1], ["%Ana%' OR 1=1 --%", "%Ana%' OR 1=1 --%", "%Ana%' OR 1=1 --%"]);
  assert.deepEqual(executed[1][1].slice(-2), [100, 100]);
});

test('rejects malformed pagination values before database access', async () => {
  const service = createClientesService({
    database: {
      async execute() { assert.fail('malformed pagination must not query the database'); },
      async getConnection() { assert.fail('listing must not start a transaction'); }
    }
  });

  await assert.rejects(
    () => service.listClientes({ pagina: '2abc', limite: '25' }),
    /paginación|página/i
  );
});

test('rejects pagination whose offset exceeds the supported query bound before database access', async () => {
  const service = createClientesService({
    database: {
      async execute() { assert.fail('unsafe pagination must not query the database'); },
      async getConnection() { assert.fail('listing must not start a transaction'); }
    }
  });

  await assert.rejects(
    () => service.listClientes({ pagina: String(Number.MAX_SAFE_INTEGER), limite: '100' }),
    /paginación.*fuera de rango/i
  );
});

test('returns a client detail and paginates that client purchase history', async () => {
  const executed = [];
  const database = {
    async getConnection() { assert.fail('read-only detail must not start a transaction'); },
    async execute(sql, parameters) {
      const normalized = sqlText(sql);
      executed.push([normalized, parameters]);
      if (/FROM clientes WHERE id = \? LIMIT 1/i.test(normalized)) {
        return [[{
          id: CLIENT_ID,
          origen_sucursal_id: LOCAL_BRANCH_ID,
          nombre: 'Ana López',
          telefono: null,
          correo: null,
          notas: null,
          activo: 1,
          version: 3
        }], []];
      }
      if (/SELECT COUNT\(\*\) AS total FROM cliente_compras WHERE cliente_id = \?/i.test(normalized)) {
        return [[{ total: 26 }], []];
      }
      if (/FROM cliente_compras WHERE cliente_id = \?/i.test(normalized)) {
        return [[{
          id: PURCHASE_ID,
          cliente_id: CLIENT_ID,
          sucursal_id: LOCAL_BRANCH_ID,
          folio_ticket: null,
          total: '25.50',
          detalle: '[{"sku":"A"}]',
          fecha_compra: '2026-08-15 12:00:00',
          version: 1
        }], []];
      }
      assert.fail(`unexpected SQL: ${normalized}`);
    }
  };
  const service = createClientesService({ database });

  const detail = await service.getCliente({ clienteId: CLIENT_ID });
  const purchases = await service.listPurchases({ clienteId: CLIENT_ID, pagina: 2, limite: 25 });

  assert.equal(detail.activo, true);
  assert.equal(purchases.data[0].total, 25.5);
  assert.deepEqual(purchases.data[0].detalle, [{ sku: 'A' }]);
  assert.deepEqual(purchases.paginacion, { pagina: 2, limite: 25, total: 26, totalPaginas: 2 });
  assert.deepEqual(executed.at(-1)[1], [CLIENT_ID, 25, 25]);
});
