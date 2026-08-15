const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLinkCode,
  generateBranchIdentity,
  generateCentralIdentity,
  issueBranchCredential,
  verifyBranchCredential,
} = require('../../services/client-identity-service');
const {
  createClientSyncService,
  createSqlSyncStore,
  signEnvelope,
  verifySignedEnvelope,
} = require('../../services/client-sync-service');

const NOW = 1_786_723_200_000;
const BRANCH_ID = 'b7cbf73a-d143-4be7-9504-2668760da581';
const CLIENT_ID = '7b34f30e-31e8-44f5-9db3-d81220d10070';
const SECOND_CLIENT_ID = '5578afe3-8f2c-4b76-8fa7-daa06ec25e26';
const LOCAL_OPERATION_ID = '113c8f99-edbb-407f-b8bf-a7b1c79d85d1';
const REMOTE_OPERATION_ID = '7c4649eb-ffbc-4b27-a2e2-a134355900ae';
const CONFLICT_OPERATION_ID = 'aaf1ff55-0df5-4bc3-b522-044811019d6d';

function operation(overrides = {}) {
  return {
    id: REMOTE_OPERATION_ID,
    cursorLocal: 5,
    sucursalId: BRANCH_ID,
    entidad: 'cliente',
    entidadId: CLIENT_ID,
    tipoOperacion: 'crear',
    payload: {
      id: CLIENT_ID,
      origen_sucursal_id: BRANCH_ID,
      nombre: 'Ana López',
      telefono: null,
      correo: null,
      notas: null,
      activo: true,
      version: 1,
    },
    version: 1,
    ...overrides,
  };
}

function createMemoryStore({ configuration, branches = [], entities = [], operations = [] } = {}) {
  const state = {
    configuration: { ...configuration },
    branches: new Map(branches.map((branch) => [branch.id, { ...branch }])),
    entities: new Map(entities.map((entry) => [`${entry.entidad}:${entry.id}`, { ...entry.payload }])),
    operations: new Map(operations.map((entry) => [entry.id, { ...entry }])),
    conflicts: [],
    savedBranches: [],
    syncStates: [],
  };

  const store = {
    state,
    async readConfiguration() {
      return { ...state.configuration };
    },
    async transaction(work) {
      return work(store);
    },
    async getBranch(branchId) {
      const branch = state.branches.get(branchId);
      return branch ? { ...branch } : null;
    },
    async saveBranch(branch) {
      state.savedBranches.push({ ...branch });
      state.branches.set(branch.id, { ...branch });
    },
    async saveBranchCredential({ branchId, credential }) {
      const branch = state.branches.get(branchId);
      state.branches.set(branchId, { ...branch, credential });
    },
    async hasOperation(operationId) {
      return state.operations.has(operationId);
    },
    async saveIncomingOperation(entry) {
      state.operations.set(entry.id, { ...entry, estado: 'sincronizado' });
    },
    async getEntity(entidad, entityId) {
      const entity = state.entities.get(`${entidad}:${entityId}`);
      return entity ? { ...entity } : null;
    },
    async insertEntity(entidad, payload) {
      state.entities.set(`${entidad}:${payload.id}`, { ...payload });
    },
    async updateEntity(entidad, payload) {
      state.entities.set(`${entidad}:${payload.id}`, { ...payload });
    },
    async hasPendingEntityOperation(entidad, entityId) {
      return [...state.operations.values()].some((entry) =>
        entry.entidad === entidad &&
        entry.entidadId === entityId &&
        entry.estado === 'pendiente'
      );
    },
    async saveConflict(conflict) {
      state.conflicts.push({ ...conflict });
    },
    async listPendingOperations(branchId, limit) {
      return [...state.operations.values()]
        .filter((entry) => entry.sucursalId === branchId && entry.estado === 'pendiente')
        .slice(0, limit)
        .map((entry) => ({ ...entry }));
    },
    async countPendingOperations(branchId) {
      return [...state.operations.values()].filter((entry) =>
        entry.sucursalId === branchId && entry.estado === 'pendiente'
      ).length;
    },
    async markOperationsSynced(operationIds) {
      for (const id of operationIds) {
        const entry = state.operations.get(id);
        if (entry) state.operations.set(id, { ...entry, estado: 'sincronizado' });
      }
    },
    async listOperationsAfter(cursor, limit) {
      return [...state.operations.values()]
        .filter((entry) => Number(entry.cursorLocal || 0) > cursor)
        .sort((left, right) => left.cursorLocal - right.cursorLocal)
        .slice(0, limit)
        .map((entry) => ({ ...entry }));
    },
    async saveLocalSyncState(syncState) {
      state.syncStates.push({ ...syncState });
      state.configuration.sucursal_credential = syncState.credential;
      state.configuration.ultimo_cursor_recibido = syncState.cursor;
    },
    async savePairing(pairing) {
      state.configuration.central_fingerprint = pairing.centralFingerprint;
      state.configuration.central_public_key = pairing.centralPublicKey;
      state.configuration.sucursal_credential = pairing.credential;
      state.branches.set(pairing.centralId, {
        id: pairing.centralId,
        nombre: pairing.centralName,
        rolNodo: 'central',
        publicKey: pairing.centralPublicKey,
        keyFingerprint: pairing.centralFingerprint,
        credential: null,
        activo: true,
      });
    },
  };
  return store;
}

function centralConfig(central) {
  return {
    sucursal_id: 'dd26d267-52e7-4b90-b1ee-c53289448be0',
    rol_nodo: 'central',
    central_fingerprint: central.fingerprint,
    central_public_key: central.publicKey,
    central_private_key: central.privateKey,
  };
}

function branchConfig({ central, branch, credential }) {
  return {
    sucursal_id: BRANCH_ID,
    rol_nodo: 'sucursal',
    central_fingerprint: central.fingerprint,
    central_public_key: central.publicKey,
    sucursal_public_key: branch.publicKey,
    sucursal_private_key: branch.privateKey,
    sucursal_credential: credential,
    ultimo_cursor_recibido: 0,
  };
}

function linkRequest({ central, branch }) {
  const code = createLinkCode({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    now: NOW,
    ttlMs: 60_000,
  });
  return signEnvelope({
    privateKey: branch.privateKey,
    payload: {
      version: 1,
      type: 'clientes-link-request',
      requestId: '06b02906-e22e-43bf-ab7d-b85211f4ec66',
      issuedAt: NOW,
      branchId: BRANCH_ID,
      branchName: 'Sucursal Norte',
      branchPublicKey: branch.publicKey,
      linkCode: code,
    },
  });
}

test('loads the durable receive cursor from the local branch record after a restart', async () => {
  const database = {
    async getConnection() { assert.fail('readConfiguration must not start a transaction'); },
    async execute(sql) {
      if (/LEFT JOIN sucursales/i.test(sql)) {
        return [[{
          sucursal_id: BRANCH_ID,
          rol_nodo: 'sucursal',
          central_fingerprint: 'a'.repeat(64),
          central_public_key: 'public-key',
          sucursal_public_key: 'branch-public-key',
          sucursal_private_key: 'branch-private-key',
          sucursal_credential: 'credential',
          ultimo_cursor_recibido: 37,
        }], []];
      }
      return [[{
        sucursal_id: BRANCH_ID,
        rol_nodo: 'sucursal',
        central_fingerprint: 'a'.repeat(64),
      }], []];
    },
  };

  const configuration = await createSqlSyncStore({ database }).readConfiguration();

  assert.equal(configuration.ultimo_cursor_recibido, 37);
});

test('an unpaired branch discovers by link code, signs activation, and pins only central identity material', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const linkCode = createLinkCode({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    now: NOW,
    ttlMs: 60_000,
  });
  const store = createMemoryStore({
    configuration: {
      sucursal_id: BRANCH_ID,
      rol_nodo: 'sucursal',
      central_fingerprint: null,
      central_public_key: null,
      sucursal_public_key: branch.publicKey,
      sucursal_private_key: branch.privateKey,
      sucursal_credential: null,
    },
  });
  const endpoint = {
    address: '192.168.90.10',
    port: 4312,
    centralFingerprint: central.fingerprint,
    centralPublicKey: central.publicKey,
  };
  const sync = createClientSyncService({
    store,
    now: () => NOW,
    createUuid: () => '06b02906-e22e-43bf-ab7d-b85211f4ec66',
    discoveryService: {
      getLastCentral: () => null,
      async discover(input) {
        assert.deepEqual(input, { linkCode });
        return endpoint;
      },
    },
    async transport(receivedEndpoint, envelope, path) {
      assert.deepEqual(receivedEndpoint, endpoint);
      assert.equal(path, '/api/clientes-sync/vincular');
      const requestPayload = verifySignedEnvelope({
        envelope,
        publicKey: branch.publicKey,
        expectedType: 'clientes-link-request',
        now: NOW,
      });
      assert.equal(requestPayload.linkCode, linkCode);
      assert.equal(Object.hasOwn(requestPayload, 'address'), false);
      const credential = issueBranchCredential({
        privateKey: central.privateKey,
        centralFingerprint: central.fingerprint,
        branchId: BRANCH_ID,
        branchPublicKey: branch.publicKey,
        now: NOW,
      });
      return signEnvelope({
        privateKey: central.privateKey,
        payload: {
          version: 1,
          type: 'clientes-link-response',
          requestId: requestPayload.requestId,
          issuedAt: NOW,
          branchId: BRANCH_ID,
          centralId: 'dd26d267-52e7-4b90-b1ee-c53289448be0',
          centralName: 'Central Clientes',
          centralFingerprint: central.fingerprint,
          credential,
        },
      });
    },
  });

  const result = await sync.pairWithCentral({
    linkCode,
    branchName: 'Sucursal Norte',
  });

  assert.deepEqual(result, {
    centralId: 'dd26d267-52e7-4b90-b1ee-c53289448be0',
    centralFingerprint: central.fingerprint,
  });
  assert.equal(store.state.configuration.central_fingerprint, central.fingerprint);
  assert.equal(store.state.configuration.central_public_key, central.publicKey);
  assert.ok(store.state.configuration.sucursal_credential);
  assert.equal(JSON.stringify(store.state.configuration).includes(endpoint.address), false);
});

test('links a branch only with its signed request and rotates a central-signed credential without storing its endpoint', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const store = createMemoryStore({ configuration: centralConfig(central) });
  const sync = createClientSyncService({
    store,
    now: () => NOW,
    createUuid: () => 'd4d94f5a-6170-41e2-9880-21c90bed5a08',
  });

  const response = await sync.linkBranch({ envelope: linkRequest({ central, branch }) });
  const payload = verifySignedEnvelope({
    envelope: response,
    publicKey: central.publicKey,
    expectedType: 'clientes-link-response',
    now: NOW,
  });

  assert.equal(payload.branchId, BRANCH_ID);
  assert.equal(payload.centralFingerprint, central.fingerprint);
  verifyBranchCredential({
    credential: payload.credential,
    centralPublicKey: central.publicKey,
    expectedCentralFingerprint: central.fingerprint,
    expectedBranchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  assert.equal(store.state.savedBranches.length, 1);
  assert.deepEqual(
    Object.keys(store.state.savedBranches[0]).sort(),
    ['activo', 'credential', 'id', 'keyFingerprint', 'nombre', 'publicKey', 'rolNodo'].sort()
  );
  assert.equal(JSON.stringify(store.state.savedBranches[0]).includes('192.168.'), false);

  const unsigned = linkRequest({ central, branch });
  unsigned.signature = unsigned.signature.replace(/^./, unsigned.signature[0] === 'A' ? 'B' : 'A');
  await assert.rejects(sync.linkBranch({ envelope: unsigned }), /firma|firmada/i);
});

test('does not let a valid link code replace the key of an existing branch UUID', async () => {
  const central = generateCentralIdentity();
  const linkedBranch = generateBranchIdentity();
  const attackerBranch = generateBranchIdentity();
  const store = createMemoryStore({ configuration: centralConfig(central) });
  const sync = createClientSyncService({ store, now: () => NOW });

  await sync.linkBranch({ envelope: linkRequest({ central, branch: linkedBranch }) });

  await assert.rejects(
    sync.linkBranch({ envelope: linkRequest({ central, branch: attackerBranch }) }),
    /sucursal.*clave|identidad.*sucursal|ya.*vinculada/i
  );
  assert.equal(
    require('../../services/client-identity-service').fingerprintPublicKey(
      store.state.branches.get(BRANCH_ID).publicKey
    ),
    linkedBranch.fingerprint
  );

  store.state.branches.set(BRANCH_ID, {
    ...store.state.branches.get(BRANCH_ID),
    activo: false,
  });
  await assert.rejects(
    sync.linkBranch({ envelope: linkRequest({ central, branch: linkedBranch }) }),
    /sucursal.*inactiva|reactiv|administrador/i
  );
  assert.equal(store.state.branches.get(BRANCH_ID).activo, false);
});

test('pairing rechecks a branch under transaction lock and cannot undo concurrent deactivation', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const store = createMemoryStore({
    configuration: centralConfig(central),
    branches: [{
      id: BRANCH_ID,
      nombre: 'Sucursal Norte',
      rolNodo: 'sucursal',
      publicKey: branch.publicKey,
      keyFingerprint: branch.fingerprint,
      credential: 'existing',
      activo: true,
    }],
  });
  store.transaction = async (work) => {
    store.state.branches.set(BRANCH_ID, {
      ...store.state.branches.get(BRANCH_ID),
      activo: false,
    });
    return work(store);
  };
  const sync = createClientSyncService({ store, now: () => NOW });

  await assert.rejects(
    sync.linkBranch({ envelope: linkRequest({ central, branch }) }),
    /sucursal.*inactiva|reactiv|administrador/i
  );
  assert.equal(store.state.branches.get(BRANCH_ID).activo, false);
});

test('applies a signed branch operation once when the same operation UUID is retried', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const store = createMemoryStore({ configuration: centralConfig(central) });
  const sync = createClientSyncService({
    store,
    now: () => NOW,
    createUuid: () => 'd4d94f5a-6170-41e2-9880-21c90bed5a08',
  });
  const linked = verifySignedEnvelope({
    envelope: await sync.linkBranch({ envelope: linkRequest({ central, branch }) }),
    publicKey: central.publicKey,
    expectedType: 'clientes-link-response',
    now: NOW,
  });
  const request = signEnvelope({
    privateKey: branch.privateKey,
    payload: {
      version: 1,
      type: 'clientes-sync-request',
      requestId: '0b020b53-c886-4e70-97c1-ea852e0abe45',
      issuedAt: NOW,
      branchId: BRANCH_ID,
      credential: linked.credential,
      lastReceivedCursor: 0,
      operations: [operation()],
    },
  });

  const first = verifySignedEnvelope({
    envelope: await sync.acceptSync({ envelope: request }),
    publicKey: central.publicKey,
    expectedType: 'clientes-sync-response',
    now: NOW,
  });
  const staleNewOperationRequest = signEnvelope({
    privateKey: branch.privateKey,
    payload: {
      ...request.payload,
      requestId: '697f75c7-c7fb-4dbd-af5b-fde1c43622df',
      operations: [operation({
        id: CONFLICT_OPERATION_ID,
        entidadId: SECOND_CLIENT_ID,
        payload: {
          ...operation().payload,
          id: SECOND_CLIENT_ID,
        },
      })],
    },
  });
  await assert.rejects(
    sync.acceptSync({ envelope: staleNewOperationRequest }),
    /credencial.*vigente|rotada|renovada/i
  );
  const second = verifySignedEnvelope({
    envelope: await sync.acceptSync({ envelope: request }),
    publicKey: central.publicKey,
    expectedType: 'clientes-sync-response',
    now: NOW,
  });

  assert.deepEqual(first.acknowledgedOperationIds, [REMOTE_OPERATION_ID]);
  assert.deepEqual(second.acknowledgedOperationIds, [REMOTE_OPERATION_ID]);
  assert.equal(store.state.operations.size, 1);
  assert.equal(store.state.entities.size, 1);
  assert.equal(store.state.conflicts.length, 0);
  assert.notEqual(second.credential, linked.credential);
});

test('sync rechecks active state under lock and cannot undo concurrent administrative deactivation', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const store = createMemoryStore({
    configuration: centralConfig(central),
    branches: [{
      id: BRANCH_ID,
      nombre: 'Sucursal Norte',
      rolNodo: 'sucursal',
      publicKey: branch.publicKey,
      keyFingerprint: branch.fingerprint,
      credential,
      activo: true,
    }],
  });
  store.transaction = async (work) => {
    store.state.branches.set(BRANCH_ID, {
      ...store.state.branches.get(BRANCH_ID),
      activo: false,
    });
    return work(store);
  };
  const sync = createClientSyncService({ store, now: () => NOW });
  const envelope = signEnvelope({
    privateKey: branch.privateKey,
    payload: {
      version: 1,
      type: 'clientes-sync-request',
      requestId: '0b020b53-c886-4e70-97c1-ea852e0abe45',
      issuedAt: NOW,
      branchId: BRANCH_ID,
      credential,
      lastReceivedCursor: 0,
      operations: [],
    },
  });

  await assert.rejects(sync.acceptSync({ envelope }), /sucursal.*vinculada|inactiva/i);
  assert.equal(store.state.branches.get(BRANCH_ID).activo, false);
});

test('rejects a signed sync batch over the configured limit before applying any operation', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const store = createMemoryStore({
    configuration: centralConfig(central),
    branches: [{
      id: BRANCH_ID,
      nombre: 'Sucursal Norte',
      rolNodo: 'sucursal',
      publicKey: branch.publicKey,
      credential,
      activo: true,
    }],
  });
  const sync = createClientSyncService({ store, now: () => NOW, batchLimit: 1 });
  const envelope = signEnvelope({
    privateKey: branch.privateKey,
    payload: {
      version: 1,
      type: 'clientes-sync-request',
      requestId: '0b020b53-c886-4e70-97c1-ea852e0abe45',
      issuedAt: NOW,
      branchId: BRANCH_ID,
      credential,
      lastReceivedCursor: 0,
      operations: [
        operation(),
        operation({ id: CONFLICT_OPERATION_ID, entidadId: SECOND_CLIENT_ID }),
      ],
    },
  });

  await assert.rejects(sync.acceptSync({ envelope }), /lote|l[ií]mite/i);
  assert.equal(store.state.operations.size, 0);
  assert.equal(store.state.entities.size, 0);
});

test('rejects a branch-created entity whose payload claims another origin branch', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const store = createMemoryStore({
    configuration: centralConfig(central),
    branches: [{
      id: BRANCH_ID,
      nombre: 'Sucursal Norte',
      rolNodo: 'sucursal',
      publicKey: branch.publicKey,
      credential,
      activo: true,
    }],
  });
  const forged = operation({
    payload: {
      ...operation().payload,
      origen_sucursal_id: 'dd26d267-52e7-4b90-b1ee-c53289448be0',
    },
  });
  const sync = createClientSyncService({ store, now: () => NOW });
  const envelope = signEnvelope({
    privateKey: branch.privateKey,
    payload: {
      version: 1,
      type: 'clientes-sync-request',
      requestId: '0b020b53-c886-4e70-97c1-ea852e0abe45',
      issuedAt: NOW,
      branchId: BRANCH_ID,
      credential,
      lastReceivedCursor: 0,
      operations: [forged],
    },
  });

  await assert.rejects(sync.acceptSync({ envelope }), /origen|atribuci[oó]n|sucursal.*contenido/i);
  assert.equal(store.state.entities.size, 0);
});

test('applies a sequential branch edit based on the received central version despite pending delivery state', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const centralId = centralConfig(central).sucursal_id;
  const original = {
    ...operation().payload,
    origen_sucursal_id: centralId,
    nombre: 'Creado en central',
  };
  const store = createMemoryStore({
    configuration: centralConfig(central),
    branches: [{
      id: BRANCH_ID,
      nombre: 'Sucursal Norte',
      rolNodo: 'sucursal',
      publicKey: branch.publicKey,
      credential,
      activo: true,
    }],
    entities: [{ entidad: 'cliente', id: CLIENT_ID, payload: original }],
    operations: [operation({
      id: LOCAL_OPERATION_ID,
      cursorLocal: 1,
      sucursalId: centralId,
      payload: original,
      estado: 'pendiente',
    })],
  });
  const sequentialEdit = operation({
    id: CONFLICT_OPERATION_ID,
    cursorLocal: 2,
    tipoOperacion: 'editar',
    baseVersion: 1,
    payload: { ...original, nombre: 'Editado en sucursal', version: 2 },
    version: 2,
  });
  const sync = createClientSyncService({ store, now: () => NOW });
  const envelope = signEnvelope({
    privateKey: branch.privateKey,
    payload: {
      version: 1,
      type: 'clientes-sync-request',
      requestId: '0b020b53-c886-4e70-97c1-ea852e0abe45',
      issuedAt: NOW,
      branchId: BRANCH_ID,
      credential,
      lastReceivedCursor: 0,
      operations: [sequentialEdit],
    },
  });

  await sync.acceptSync({ envelope });

  assert.equal(store.state.entities.get(`cliente:${CLIENT_ID}`).nombre, 'Editado en sucursal');
  assert.equal(store.state.entities.get(`cliente:${CLIENT_ID}`).version, 2);
  assert.equal(store.state.conflicts.length, 0);
});

test('keeps every pending operation untouched when a branch cannot discover its central', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const pending = operation({ id: LOCAL_OPERATION_ID, estado: 'pendiente' });
  const store = createMemoryStore({
    configuration: branchConfig({ central, branch, credential }),
    operations: [pending],
  });
  const sync = createClientSyncService({
    store,
    now: () => NOW,
    discoveryService: {
      getLastCentral: () => null,
      discover: async () => { throw new Error('central no encontrada'); },
    },
    transport: async () => assert.fail('offline sync must not call the network transport'),
  });

  assert.deepEqual(await sync.syncOnce(), { status: 'offline', pending: 1 });
  assert.equal(store.state.operations.get(LOCAL_OPERATION_ID).estado, 'pendiente');
  assert.equal(store.state.syncStates.length, 0);
});

test('rejects a discovered endpoint outside private LAN ranges before calling transport', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const store = createMemoryStore({ configuration: branchConfig({ central, branch, credential }) });
  let transportCalled = false;
  const sync = createClientSyncService({
    store,
    discoveryService: {
      getLastCentral: () => ({
        address: '203.0.113.20',
        port: 4312,
        centralFingerprint: central.fingerprint,
      }),
    },
    transport: async () => {
      transportCalled = true;
      throw new Error('transport should not be reached');
    },
  });

  await assert.rejects(sync.syncOnce(), /LAN|subred|direcci[oó]n.*local/i);
  assert.equal(transportCalled, false);
});

test('aborts an unresponsive central transport within the configured deadline', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const store = createMemoryStore({ configuration: branchConfig({ central, branch, credential }) });
  let receivedSignal;
  const sync = createClientSyncService({
    store,
    transportTimeoutMs: 10,
    discoveryService: {
      getLastCentral: () => ({
        address: '192.168.50.10',
        port: 4312,
        centralFingerprint: central.fingerprint,
      }),
    },
    fetchFn: async (_url, options) => {
      receivedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    },
  });

  await assert.rejects(sync.syncOnce(), /abort|timeout|tiempo/i);
  assert.equal(receivedSignal.aborted, true);
});

test('automatic sync uses progressive retry delays after failures', async () => {
  const scheduled = [];
  const store = createMemoryStore({
    configuration: {
      sucursal_id: BRANCH_ID,
      rol_nodo: 'sucursal',
      central_fingerprint: null,
      central_public_key: null,
      sucursal_public_key: 'invalid',
      sucursal_private_key: 'invalid',
    },
  });
  const sync = createClientSyncService({
    store,
    retryBaseMs: 250,
    retryMaxMs: 1_000,
    setTimeoutFn(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeoutFn() {},
  });

  await sync.start();
  const immediate = scheduled.shift();
  assert.equal(immediate.delay, 0);
  immediate.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled[0].delay, 250);
  scheduled.shift().callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled[0].delay, 500);
  await sync.stop();
});

test('stopping sync while configuration is pending prevents a later background schedule', async () => {
  let releaseConfiguration;
  const configurationGate = new Promise((resolve) => { releaseConfiguration = resolve; });
  const store = createMemoryStore({ configuration: { rol_nodo: 'sucursal' } });
  store.readConfiguration = async () => {
    await configurationGate;
    return { rol_nodo: 'sucursal' };
  };
  const scheduled = [];
  const sync = createClientSyncService({
    store,
    setTimeoutFn(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeoutFn() {},
  });

  const starting = sync.start();
  await sync.stop();
  releaseConfiguration();
  await starting;

  assert.deepEqual(scheduled, []);
});

test('a valid signed response marks acknowledgements, applies remote changes, and records divergent concurrent edits', async () => {
  const central = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const rotatedCredential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW + 1,
  });
  const localDivergent = {
    id: SECOND_CLIENT_ID,
    origen_sucursal_id: BRANCH_ID,
    nombre: 'Nombre local',
    telefono: null,
    correo: null,
    notas: null,
    activo: true,
    version: 2,
  };
  const pending = operation({
    id: LOCAL_OPERATION_ID,
    cursorLocal: 9,
    entidadId: SECOND_CLIENT_ID,
    payload: localDivergent,
    version: 2,
    estado: 'pendiente',
  });
  const store = createMemoryStore({
    configuration: branchConfig({ central, branch, credential }),
    entities: [{ entidad: 'cliente', id: SECOND_CLIENT_ID, payload: localDivergent }],
    operations: [pending],
  });
  const remoteNew = operation();
  const remoteDivergent = operation({
    id: CONFLICT_OPERATION_ID,
    cursorLocal: 7,
    sucursalId: 'dd26d267-52e7-4b90-b1ee-c53289448be0',
    entidadId: SECOND_CLIENT_ID,
    tipoOperacion: 'editar',
    payload: { ...localDivergent, nombre: 'Nombre central' },
    version: 2,
  });
  const endpoint = {
    address: '192.168.50.10',
    port: 4312,
    centralFingerprint: central.fingerprint,
  };
  const sync = createClientSyncService({
    store,
    now: () => NOW,
    createUuid: () => 'd4d94f5a-6170-41e2-9880-21c90bed5a08',
    discoveryService: {
      getLastCentral: () => endpoint,
      discover: async () => assert.fail('cached volatile endpoint should be used'),
    },
    async transport(receivedEndpoint, envelope) {
      assert.deepEqual(receivedEndpoint, endpoint);
      const requestPayload = verifySignedEnvelope({
        envelope,
        publicKey: branch.publicKey,
        expectedType: 'clientes-sync-request',
        now: NOW,
      });
      assert.deepEqual(requestPayload.operations.map((entry) => entry.id), [LOCAL_OPERATION_ID]);
      return signEnvelope({
        privateKey: central.privateKey,
        payload: {
          version: 1,
          type: 'clientes-sync-response',
          requestId: requestPayload.requestId,
          issuedAt: NOW,
          branchId: BRANCH_ID,
          centralFingerprint: central.fingerprint,
          acknowledgedOperationIds: [LOCAL_OPERATION_ID],
          operations: [remoteNew, remoteDivergent],
          nextCursor: 7,
          credential: rotatedCredential,
        },
      });
    },
  });

  const result = await sync.syncOnce();

  assert.deepEqual(result, {
    status: 'synchronized',
    sent: 1,
    received: 2,
    conflicts: 1,
    pending: 0,
  });
  assert.equal(store.state.operations.get(LOCAL_OPERATION_ID).estado, 'sincronizado');
  assert.equal(store.state.entities.get(`cliente:${CLIENT_ID}`).nombre, 'Ana López');
  assert.equal(store.state.entities.get(`cliente:${SECOND_CLIENT_ID}`).nombre, 'Nombre local');
  assert.equal(store.state.conflicts.length, 1);
  assert.equal(store.state.conflicts[0].payloadRemoto.nombre, 'Nombre central');
  assert.equal(store.state.configuration.sucursal_credential, rotatedCredential);
  assert.equal(store.state.configuration.ultimo_cursor_recibido, 7);
  assert.equal(JSON.stringify(store.state.syncStates).includes(endpoint.address), false);
});

test('does not mark pending operations when the central response signature is invalid', async () => {
  const central = generateCentralIdentity();
  const impostor = generateCentralIdentity();
  const branch = generateBranchIdentity();
  const credential = issueBranchCredential({
    privateKey: central.privateKey,
    centralFingerprint: central.fingerprint,
    branchId: BRANCH_ID,
    branchPublicKey: branch.publicKey,
    now: NOW,
  });
  const pending = operation({ id: LOCAL_OPERATION_ID, estado: 'pendiente' });
  const store = createMemoryStore({
    configuration: branchConfig({ central, branch, credential }),
    operations: [pending],
  });
  const sync = createClientSyncService({
    store,
    now: () => NOW,
    discoveryService: {
      getLastCentral: () => ({
        address: '192.168.50.10',
        port: 4312,
        centralFingerprint: central.fingerprint,
      }),
    },
    async transport(_endpoint, envelope) {
      const requestPayload = verifySignedEnvelope({
        envelope,
        publicKey: branch.publicKey,
        expectedType: 'clientes-sync-request',
        now: NOW,
      });
      return signEnvelope({
        privateKey: impostor.privateKey,
        payload: {
          version: 1,
          type: 'clientes-sync-response',
          requestId: requestPayload.requestId,
          issuedAt: NOW,
          branchId: BRANCH_ID,
          centralFingerprint: central.fingerprint,
          acknowledgedOperationIds: [LOCAL_OPERATION_ID],
          operations: [],
          nextCursor: 0,
          credential,
        },
      });
    },
  });

  await assert.rejects(sync.syncOnce(), /firma|firmada/i);
  assert.equal(store.state.operations.get(LOCAL_OPERATION_ID).estado, 'pendiente');
  assert.equal(store.state.syncStates.length, 0);
});
