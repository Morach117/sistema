const { createPublicKey, randomUUID, sign, verify } = require('node:crypto');
const {
  createLinkCode: createIdentityLinkCode,
  fingerprintPublicKey,
  generateBranchIdentity,
  generateCentralIdentity,
  issueBranchCredential,
  verifyBranchCredential,
  verifyCentralFingerprint,
  verifyLinkCode,
} = require('./client-identity-service');
const { releaseConnection, rollbackTransaction } = require('../middleware/errors');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_BATCH_LIMIT = 100;
const MAX_BATCH_LIMIT = 500;
const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

class ClientSyncError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'ClientSyncError';
    this.status = status;
    this.isPublic = true;
  }
}

function objectValue(value, message = 'La solicitud firmada no es válida.') {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ClientSyncError(message, 400);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Los números firmados deben ser finitos.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError('El contenido firmado no es JSON válido.');
}

function signEnvelope({ payload, privateKey } = {}) {
  objectValue(payload);
  const signature = sign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey);
  return { payload, signature: signature.toString('base64url') };
}

function verifySignedEnvelope({
  envelope,
  publicKey,
  expectedType,
  now = Date.now(),
  maxClockSkewMs = DEFAULT_CLOCK_SKEW_MS,
} = {}) {
  const signed = objectValue(envelope);
  const payload = objectValue(signed.payload);
  if (
    typeof signed.signature !== 'string' ||
    !SIGNATURE_PATTERN.test(signed.signature) ||
    signed.signature.length > 256
  ) {
    throw new ClientSyncError('La solicitud no contiene una firma válida.', 401);
  }
  const signature = Buffer.from(signed.signature, 'base64url');
  if (
    signature.length !== 64 ||
    signature.toString('base64url') !== signed.signature ||
    !verify(null, Buffer.from(canonicalJson(payload), 'utf8'), publicKey, signature)
  ) {
    throw new ClientSyncError('La firma de la solicitud no es válida.', 401);
  }
  if (payload.version !== 1 || payload.type !== expectedType) {
    throw new ClientSyncError('El tipo o versión de la solicitud firmada no es válido.', 400);
  }
  if (!Number.isSafeInteger(payload.issuedAt)) {
    throw new ClientSyncError('La solicitud firmada no contiene una fecha válida.', 400);
  }
  const currentTime = typeof now === 'function' ? now() : now;
  if (
    !Number.isSafeInteger(currentTime) ||
    !Number.isSafeInteger(maxClockSkewMs) ||
    maxClockSkewMs < 0 ||
    Math.abs(currentTime - payload.issuedAt) > maxClockSkewMs
  ) {
    throw new ClientSyncError('La solicitud firmada está fuera de vigencia.', 401);
  }
  return payload;
}

function uuid(value, fieldName) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new ClientSyncError(`${fieldName} no es válido.`);
  }
  return normalized;
}

function boundedInteger(value, fieldName, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new ClientSyncError(`${fieldName} no es válido.`);
  }
  return value;
}

function text(value, fieldName, maximum, { required = false } = {}) {
  const normalized = value === null || value === undefined ? '' : String(value).trim();
  if ((required && !normalized) || normalized.length > maximum) {
    throw new ClientSyncError(`${fieldName} no es válido.`);
  }
  return normalized || null;
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('La base local contiene JSON de sincronización inválido.');
  }
}

function normalizeOperation(value) {
  const operation = objectValue(value, 'La operación de sincronización no es válida.');
  const entidad = String(operation.entidad || '');
  if (!['cliente', 'compra'].includes(entidad)) {
    throw new ClientSyncError('La entidad de sincronización no es válida.');
  }
  const tipoOperacion = String(operation.tipoOperacion || '');
  const allowedActions = entidad === 'cliente'
    ? new Set(['crear', 'editar', 'desactivar'])
    : new Set(['crear']);
  if (!allowedActions.has(tipoOperacion)) {
    throw new ClientSyncError('El tipo de operación de sincronización no es válido.');
  }
  const payload = objectValue(operation.payload, 'El contenido de la operación no es válido.');
  const version = boundedInteger(
    Number(operation.version),
    'La versión de la operación',
    { minimum: 1 }
  );
  const baseVersion = operation.baseVersion === undefined
    ? version - 1
    : boundedInteger(Number(operation.baseVersion), 'La versión base');
  if (version !== baseVersion + 1) {
    throw new ClientSyncError('La versión de la operación no continúa su versión base.');
  }
  const normalized = {
    id: uuid(operation.id, 'La operación'),
    cursorLocal: boundedInteger(Number(operation.cursorLocal || 0), 'El cursor local'),
    sucursalId: uuid(operation.sucursalId, 'La sucursal de la operación'),
    entidad,
    entidadId: uuid(operation.entidadId, 'La entidad de la operación'),
    tipoOperacion,
    payload: { ...payload },
    baseVersion,
    version,
  };
  if (
    uuid(payload.id, 'El contenido de la entidad') !== normalized.entidadId ||
    Number(payload.version) !== normalized.version
  ) {
    throw new ClientSyncError('El contenido de la operación no coincide con su identidad o versión.');
  }
  if (entidad === 'cliente') {
    const originBranchId = uuid(payload.origen_sucursal_id, 'La sucursal de origen');
    if (tipoOperacion === 'crear' && originBranchId !== normalized.sucursalId) {
      throw new ClientSyncError('La sucursal de origen no coincide con la atribución de la operación.');
    }
    text(payload.nombre, 'El nombre del cliente', 180, { required: true });
    if (typeof payload.activo !== 'boolean') {
      throw new ClientSyncError('El estado del cliente no es válido.');
    }
  } else {
    uuid(payload.cliente_id, 'El cliente de la compra');
    if (uuid(payload.sucursal_id, 'La sucursal de la compra') !== normalized.sucursalId) {
      throw new ClientSyncError('La sucursal de la compra no coincide con la atribución de la operación.');
    }
    if (!Number.isFinite(Number(payload.total)) || Number(payload.total) < 0) {
      throw new ClientSyncError('El total de la compra no es válido.');
    }
    if (!Number.isFinite(Date.parse(payload.fecha_compra))) {
      throw new ClientSyncError('La fecha de compra no es válida.');
    }
  }
  return normalized;
}

function mapOperationRow(row) {
  return normalizeOperation({
    id: row.id,
    cursorLocal: Number(row.cursorLocal ?? row.cursor_local ?? 0),
    sucursalId: row.sucursalId ?? row.sucursal_id,
    entidad: row.entidad,
    entidadId: row.entidadId ?? row.entidad_id,
    tipoOperacion: row.tipoOperacion ?? row.tipo_operacion,
    payload: parseJson(row.payload),
    baseVersion: row.baseVersion,
    version: Number(row.version),
  });
}

function databaseDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ClientSyncError('La fecha de compra no es válida.');
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function isPrivateLanAddress(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function assertLanEndpoint(endpoint) {
  if (
    !endpoint ||
    !isPrivateLanAddress(endpoint.address) ||
    !Number.isInteger(endpoint.port) ||
    endpoint.port < 1 ||
    endpoint.port > 65_535
  ) {
    throw new ClientSyncError('La dirección de la central no pertenece a una LAN privada.', 403);
  }
  return endpoint;
}

function mapBranch(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    rolNodo: row.rolNodo ?? row.rol_nodo,
    publicKey: row.publicKey ?? row.public_key,
    keyFingerprint: row.keyFingerprint ?? row.key_fingerprint,
    credential: row.credential,
    activo: Boolean(row.activo),
  };
}

function createSqlSyncStore({ database = require('../config/database'), executor = database } = {}) {
  if (!database || typeof database.getConnection !== 'function' || typeof executor.execute !== 'function') {
    throw new TypeError('Se requiere una conexión de base de datos válida.');
  }
  return {
    async readConfiguration({ allowMissing = false, forUpdate = false } = {}) {
      const [rows] = await executor.execute(
        `SELECT configuracion.sucursal_id, configuracion.rol_nodo,
                configuracion.central_fingerprint, configuracion.central_public_key,
                configuracion.central_private_key, configuracion.sucursal_public_key,
                configuracion.sucursal_private_key, configuracion.sucursal_credential,
                sucursal.nombre AS sucursal_nombre,
                COALESCE(sucursal.ultimo_cursor_recibido, 0) AS ultimo_cursor_recibido
          FROM cliente_configuracion AS configuracion
          LEFT JOIN sucursales AS sucursal ON sucursal.id = configuracion.sucursal_id
          WHERE configuracion.alcance_local = 1
          LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`
      );
      if (rows.length !== 1) {
        if (allowMissing) return null;
        throw new ClientSyncError('Esta instalación no tiene identidad LAN configurada.', 409);
      }
      return rows[0];
    },

    async initializeConfiguration(initialization) {
      await executor.execute(
        `INSERT INTO sucursales
           (id, nombre, rol_nodo, public_key, key_fingerprint, credential, activo)
         VALUES (?, ?, ?, ?, ?, NULL, 1)`,
        [initialization.nodeId, initialization.name, initialization.role,
          initialization.nodePublicKey, initialization.nodeFingerprint]
      );
      await executor.execute(
        `INSERT INTO cliente_configuracion
           (id, alcance_local, sucursal_id, rol_nodo, central_fingerprint,
            central_public_key, central_private_key, sucursal_public_key,
            sucursal_private_key, sucursal_credential)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [initialization.configurationId, initialization.nodeId, initialization.role,
          initialization.centralFingerprint, initialization.centralPublicKey,
          initialization.centralPrivateKey, initialization.branchPublicKey,
          initialization.branchPrivateKey]
      );
    },

    async renameLocalBranch({ branchId, name }) {
      await executor.execute(
        'UPDATE sucursales SET nombre = ? WHERE id = ? AND activo = 1',
        [name, branchId]
      );
    },

    async readStatus() {
      const [rows] = await executor.execute(
        `SELECT configuracion.sucursal_id, configuracion.rol_nodo,
                configuracion.central_fingerprint,
                sucursal.nombre AS sucursal_nombre,
                (SELECT COUNT(*) FROM cliente_operaciones_sync AS operacion
                  WHERE operacion.sucursal_id = configuracion.sucursal_id
                    AND operacion.estado = 'pendiente') AS pendientes,
                (SELECT COUNT(*) FROM cliente_conflictos AS conflicto
                  WHERE conflicto.estado = 'pendiente') AS conflictos
           FROM cliente_configuracion AS configuracion
           LEFT JOIN sucursales AS sucursal ON sucursal.id = configuracion.sucursal_id
          WHERE configuracion.alcance_local = 1
          LIMIT 1`
      );
      if (rows.length !== 1) {
        throw new ClientSyncError('Esta instalación no tiene identidad LAN configurada.', 409);
      }
      return rows[0];
    },

    async transaction(work, requestId) {
      let connection;
      let started = false;
      try {
        connection = await database.getConnection();
        await connection.beginTransaction();
        started = true;
        const result = await work(createSqlSyncStore({ database, executor: connection }));
        await connection.commit();
        return result;
      } catch (error) {
        if (started) await rollbackTransaction(connection, requestId);
        throw error;
      } finally {
        releaseConnection(connection, requestId);
      }
    },

    async getBranch(branchId, { forUpdate = false } = {}) {
      const [rows] = await executor.execute(
        `SELECT id, nombre, rol_nodo, public_key, key_fingerprint, credential, activo
           FROM sucursales WHERE id = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
        [branchId]
      );
      return mapBranch(rows[0]);
    },

    async saveBranch(branch) {
      await executor.execute(
        `INSERT INTO sucursales
           (id, nombre, rol_nodo, public_key, key_fingerprint, credential, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           nombre = VALUES(nombre), rol_nodo = VALUES(rol_nodo),
           public_key = VALUES(public_key), key_fingerprint = VALUES(key_fingerprint),
           credential = VALUES(credential), activo = VALUES(activo)`,
        [
          branch.id,
          branch.nombre,
          branch.rolNodo,
          branch.publicKey,
          branch.keyFingerprint,
          branch.credential,
          branch.activo ? 1 : 0,
        ]
      );
    },

    async saveBranchCredential({ branchId, credential }) {
      await executor.execute(
        'UPDATE sucursales SET credential = ? WHERE id = ? AND activo = 1',
        [credential, branchId]
      );
    },

    async hasOperation(operationId) {
      const [rows] = await executor.execute(
        'SELECT id FROM cliente_operaciones_sync WHERE id = ? LIMIT 1',
        [operationId]
      );
      return rows.length > 0;
    },

    async saveIncomingOperation(operation) {
      await executor.execute(
        `INSERT INTO cliente_operaciones_sync
           (id, sucursal_id, entidad, entidad_id, tipo_operacion, payload, version,
            estado, sincronizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'sincronizado', CURRENT_TIMESTAMP(3))`,
        [
          operation.id,
          operation.sucursalId,
          operation.entidad,
          operation.entidadId,
          operation.tipoOperacion,
          JSON.stringify(operation.payload),
          operation.version,
        ]
      );
    },

    async getEntity(entidad, entityId) {
      if (entidad === 'cliente') {
        const [rows] = await executor.execute(
          `SELECT id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version
             FROM clientes WHERE id = ? FOR UPDATE`,
          [entityId]
        );
        return rows[0] ? { ...rows[0], activo: Boolean(rows[0].activo), version: Number(rows[0].version) } : null;
      }
      const [rows] = await executor.execute(
        `SELECT id, cliente_id, sucursal_id, folio_ticket, total, detalle, fecha_compra, version
           FROM cliente_compras WHERE id = ? FOR UPDATE`,
        [entityId]
      );
      if (!rows[0]) return null;
      return {
        ...rows[0],
        total: Number(rows[0].total),
        detalle: parseJson(rows[0].detalle),
        fecha_compra: rows[0].fecha_compra instanceof Date
          ? rows[0].fecha_compra.toISOString()
          : String(rows[0].fecha_compra).replace(' ', 'T').replace(/(?<!Z)$/, 'Z'),
        version: Number(rows[0].version),
      };
    },

    async insertEntity(entidad, payload) {
      if (entidad === 'cliente') {
        await executor.execute(
          `INSERT INTO clientes
             (id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [payload.id, payload.origen_sucursal_id, payload.nombre, payload.telefono ?? null,
            payload.correo ?? null, payload.notas ?? null, payload.activo ? 1 : 0, payload.version]
        );
        return;
      }
      await executor.execute(
        `INSERT INTO cliente_compras
           (id, cliente_id, sucursal_id, folio_ticket, total, detalle, fecha_compra, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [payload.id, payload.cliente_id, payload.sucursal_id, payload.folio_ticket ?? null,
          Number(payload.total), payload.detalle == null ? null : JSON.stringify(payload.detalle),
          databaseDate(payload.fecha_compra), payload.version]
      );
    },

    async updateEntity(entidad, payload) {
      if (entidad === 'cliente') {
        await executor.execute(
          `UPDATE clientes SET origen_sucursal_id = ?, nombre = ?, telefono = ?, correo = ?,
                  notas = ?, activo = ?, version = ? WHERE id = ?`,
          [payload.origen_sucursal_id, payload.nombre, payload.telefono ?? null,
            payload.correo ?? null, payload.notas ?? null, payload.activo ? 1 : 0,
            payload.version, payload.id]
        );
      }
    },

    async hasPendingEntityOperation(entidad, entityId) {
      const [rows] = await executor.execute(
        `SELECT id FROM cliente_operaciones_sync
          WHERE entidad = ? AND entidad_id = ? AND estado = 'pendiente' LIMIT 1`,
        [entidad, entityId]
      );
      return rows.length > 0;
    },

    async saveConflict(conflict) {
      await executor.execute(
        `INSERT INTO cliente_conflictos
           (id, sucursal_id, entidad, entidad_id, payload_local, payload_remoto, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente')`,
        [conflict.id, conflict.sucursalId, conflict.entidad, conflict.entidadId,
          JSON.stringify(conflict.payloadLocal), JSON.stringify(conflict.payloadRemoto)]
      );
    },

    async listPendingOperations(branchId, limit) {
      const [rows] = await executor.execute(
        `SELECT id, cursor_local, sucursal_id, entidad, entidad_id, tipo_operacion, payload, version
           FROM cliente_operaciones_sync
          WHERE sucursal_id = ? AND estado = 'pendiente'
          ORDER BY cursor_local ASC LIMIT ?`,
        [branchId, limit]
      );
      return rows.map(mapOperationRow);
    },

    async countPendingOperations(branchId) {
      const [rows] = await executor.execute(
        `SELECT COUNT(*) AS total FROM cliente_operaciones_sync
          WHERE sucursal_id = ? AND estado = 'pendiente'`,
        [branchId]
      );
      return Number(rows[0]?.total || 0);
    },

    async markOperationsSynced(operationIds) {
      if (!operationIds.length) return;
      await executor.execute(
        `UPDATE cliente_operaciones_sync
            SET estado = 'sincronizado', sincronizado_en = CURRENT_TIMESTAMP(3), ultimo_error = NULL
          WHERE estado = 'pendiente' AND id IN (${operationIds.map(() => '?').join(', ')})`,
        operationIds
      );
    },

    async listOperationsAfter(cursor, limit) {
      const [rows] = await executor.execute(
        `SELECT id, cursor_local, sucursal_id, entidad, entidad_id, tipo_operacion, payload, version
           FROM cliente_operaciones_sync
          WHERE cursor_local > ?
          ORDER BY cursor_local ASC LIMIT ?`,
        [cursor, limit]
      );
      return rows.map(mapOperationRow);
    },

    async saveLocalSyncState({ branchId, cursor, credential }) {
      await executor.execute(
        `UPDATE cliente_configuracion
            SET sucursal_credential = ?
          WHERE alcance_local = 1 AND sucursal_id = ?`,
        [credential, branchId]
      );
      await executor.execute(
        `UPDATE sucursales
            SET ultimo_cursor_recibido = ?, ultima_sincronizacion_en = CURRENT_TIMESTAMP(3)
          WHERE id = ?`,
        [cursor, branchId]
      );
    },

    async savePairing({
      branchId,
      centralId,
      centralName,
      centralFingerprint,
      centralPublicKey,
      credential,
    }) {
      await executor.execute(
        `UPDATE cliente_configuracion
            SET central_fingerprint = ?, central_public_key = ?, sucursal_credential = ?
          WHERE alcance_local = 1 AND sucursal_id = ?`,
        [centralFingerprint, centralPublicKey, credential, branchId]
      );
      await executor.execute(
        `INSERT INTO sucursales
           (id, nombre, rol_nodo, public_key, key_fingerprint, credential, activo)
         VALUES (?, ?, 'central', ?, ?, NULL, 1)
         ON DUPLICATE KEY UPDATE
           nombre = VALUES(nombre), rol_nodo = 'central', public_key = VALUES(public_key),
           key_fingerprint = VALUES(key_fingerprint), activo = 1`,
        [centralId, centralName, centralPublicKey, centralFingerprint]
      );
    },
  };
}

function centralConfiguration(configuration) {
  if (String(configuration.rol_nodo || '').toLowerCase() !== 'central') {
    throw new ClientSyncError('Esta instalación no está configurada como Central.', 409);
  }
  if (!verifyCentralFingerprint({
    publicKey: configuration.central_public_key,
    fingerprint: configuration.central_fingerprint,
  })) {
    throw new Error('La identidad configurada de la central no es válida.');
  }
  return configuration;
}

function branchConfiguration(configuration) {
  if (String(configuration.rol_nodo || '').toLowerCase() !== 'sucursal') {
    throw new ClientSyncError('Esta instalación no está configurada como Sucursal.', 409);
  }
  if (!verifyCentralFingerprint({
    publicKey: configuration.central_public_key,
    fingerprint: configuration.central_fingerprint,
  })) {
    throw new Error('La huella configurada de la central no es válida.');
  }
  return configuration;
}

function unpairedBranchConfiguration(configuration) {
  if (String(configuration.rol_nodo || '').toLowerCase() !== 'sucursal') {
    throw new ClientSyncError('Esta instalación no está configurada como Sucursal.', 409);
  }
  const branchId = uuid(configuration.sucursal_id, 'La sucursal local');
  const publicKey = text(
    configuration.sucursal_public_key,
    'La clave pública de la sucursal',
    16_384,
    { required: true }
  );
  const privateKey = text(
    configuration.sucursal_private_key,
    'La clave privada de la sucursal',
    16_384,
    { required: true }
  );
  if (fingerprintPublicKey(publicKey) !== fingerprintPublicKey(createPublicKey(privateKey))) {
    throw new Error('Las claves configuradas de la sucursal no corresponden.');
  }
  return { configuration, branchId, publicKey, privateKey };
}

async function applyIncomingOperation({ store, operation, localBranchId, createUuid }) {
  if (await store.hasOperation(operation.id)) return { duplicate: true, conflict: false };
  const local = await store.getEntity(operation.entidad, operation.entidadId);
  if (
    local &&
    operation.entidad === 'cliente' &&
    local.origen_sucursal_id !== operation.payload.origen_sucursal_id
  ) {
    throw new ClientSyncError('La operación intenta cambiar la sucursal de origen del cliente.', 403);
  }
  let conflict = false;
  if (local && canonicalJson(local) !== canonicalJson(operation.payload)) {
    if (Number(local.version) !== operation.baseVersion) {
      conflict = true;
      await store.saveConflict({
        id: uuid(createUuid(), 'El conflicto'),
        sucursalId: localBranchId,
        entidad: operation.entidad,
        entidadId: operation.entidadId,
        payloadLocal: local,
        payloadRemoto: operation.payload,
      });
    }
  } else if (!local && operation.baseVersion !== 0) {
    conflict = true;
    await store.saveConflict({
      id: uuid(createUuid(), 'El conflicto'),
      sucursalId: localBranchId,
      entidad: operation.entidad,
      entidadId: operation.entidadId,
      payloadLocal: { ausente: true },
      payloadRemoto: operation.payload,
    });
  }
  if (!conflict) {
    if (!local) await store.insertEntity(operation.entidad, operation.payload);
    else if (
      canonicalJson(local) !== canonicalJson(operation.payload) &&
      Number(local.version) === operation.baseVersion
    ) {
      await store.updateEntity(operation.entidad, operation.payload);
    }
  }
  await store.saveIncomingOperation(operation);
  return { duplicate: false, conflict };
}

function createClientSyncService({
  store = createSqlSyncStore(),
  now = Date.now,
  createUuid = randomUUID,
  createCentralIdentity = generateCentralIdentity,
  createBranchIdentity = generateBranchIdentity,
  batchLimit = DEFAULT_BATCH_LIMIT,
  credentialTtlMs = 90 * 24 * 60 * 60 * 1000,
  discoveryService,
  transport,
  fetchFn = globalThis.fetch,
  transportTimeoutMs = 5_000,
  syncIntervalMs = 15_000,
  retryBaseMs = 1_000,
  retryMaxMs = 60_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (!store || typeof store.readConfiguration !== 'function' || typeof store.transaction !== 'function') {
    throw new TypeError('Se requiere un almacén de sincronización válido.');
  }
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > MAX_BATCH_LIMIT) {
    throw new TypeError(`batchLimit debe estar entre 1 y ${MAX_BATCH_LIMIT}.`);
  }
  if (typeof createUuid !== 'function' || typeof now !== 'function') {
    throw new TypeError('Se requieren generadores de tiempo e identidad válidos.');
  }
  if (
    !Number.isInteger(transportTimeoutMs) || transportTimeoutMs < 1 ||
    !Number.isInteger(syncIntervalMs) || syncIntervalMs < 1 ||
    !Number.isInteger(retryBaseMs) || retryBaseMs < 1 ||
    !Number.isInteger(retryMaxMs) || retryMaxMs < retryBaseMs
  ) {
    throw new TypeError('Los tiempos de sincronización y reintento no son válidos.');
  }
  let credentialSequence = 0;
  let running = false;
  let syncTimer;
  let nextRetryDelay = retryBaseMs;
  let lifecycleGeneration = 0;
  let lastConnectivityStatus;

  function nextCredential(configuration, branchId, branchPublicKey) {
    return issueBranchCredential({
      privateKey: configuration.central_private_key,
      centralFingerprint: configuration.central_fingerprint,
      branchId,
      branchPublicKey,
      now: now() + credentialSequence++,
      ttlMs: credentialTtlMs,
    });
  }

  async function configureNode({ role, name, requestId } = {}) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    if (!['central', 'sucursal'].includes(normalizedRole)) {
      throw new ClientSyncError('El rol debe ser Central o Sucursal.');
    }
    const visibleName = text(name, 'El nombre visible', 120, { required: true });

    try {
      return await store.transaction(async (transaction) => {
        const existing = await transaction.readConfiguration({ allowMissing: true, forUpdate: true });
        if (existing) {
          const existingRole = String(existing.rol_nodo || '').trim().toLowerCase();
          if (existingRole !== normalizedRole) {
            throw new ClientSyncError(
              'El rol no puede cambiar después de crear la identidad de esta instalación.',
              409
            );
          }
          await transaction.renameLocalBranch({ branchId: existing.sucursal_id, name: visibleName });
          return { sucursal: { nombre: visibleName, rol: existingRole } };
        }

        const identity = normalizedRole === 'central'
          ? createCentralIdentity()
          : createBranchIdentity();
        const nodeId = uuid(createUuid(), 'La sucursal local');
        const configurationId = uuid(createUuid(), 'La configuración local');
        await transaction.initializeConfiguration({
          configurationId,
          nodeId,
          name: visibleName,
          role: normalizedRole,
          nodePublicKey: identity.publicKey,
          nodeFingerprint: identity.fingerprint,
          centralFingerprint: normalizedRole === 'central' ? identity.fingerprint : null,
          centralPublicKey: normalizedRole === 'central' ? identity.publicKey : null,
          centralPrivateKey: normalizedRole === 'central' ? identity.privateKey : null,
          branchPublicKey: normalizedRole === 'sucursal' ? identity.publicKey : null,
          branchPrivateKey: normalizedRole === 'sucursal' ? identity.privateKey : null,
        });
        return { sucursal: { nombre: visibleName, rol: normalizedRole } };
      }, requestId);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
        throw new ClientSyncError('Esta instalación ya tiene una identidad configurada.', 409);
      }
      throw error;
    }
  }

  async function getStatus() {
    let summary;
    try {
      summary = typeof store.readStatus === 'function'
        ? await store.readStatus()
        : await store.readConfiguration();
    } catch (error) {
      if (error instanceof ClientSyncError && error.status === 409) {
        return {
          configuracionRequerida: true,
          sucursal: null,
          centralVinculada: false,
          centralFingerprint: null,
          estado: 'configuracion-requerida',
          pendientes: 0,
          conflictos: 0,
        };
      }
      throw error;
    }
    const role = String(summary.rol_nodo || '').trim().toLowerCase();
    const fingerprint = summary.central_fingerprint || null;
    let status = 'sin-vincular';
    if (role === 'central') status = 'central';
    else if (fingerprint && lastConnectivityStatus === 'conectado') status = 'conectado';
    else if (fingerprint && lastConnectivityStatus === 'offline') status = 'offline';
    else if (fingerprint) status = 'offline';

    return {
      sucursal: {
        nombre: summary.sucursal_nombre || 'Sucursal local',
        rol: role,
      },
      centralVinculada: role === 'central' || Boolean(fingerprint),
      centralFingerprint: fingerprint,
      estado: status,
      pendientes: Number(summary.pendientes || 0),
      conflictos: Number(summary.conflictos || 0),
    };
  }

  async function createPairingCode() {
    const configuration = centralConfiguration(await store.readConfiguration());
    return {
      code: createIdentityLinkCode({
        privateKey: configuration.central_private_key,
        centralFingerprint: configuration.central_fingerprint,
        now: now(),
      }),
    };
  }

  async function pairWithCentral({
    linkCode,
    branchName,
    expectedCentralFingerprint,
    requestId: httpRequestId,
  } = {}) {
    const local = unpairedBranchConfiguration(await store.readConfiguration());
    if (local.configuration.central_fingerprint || local.configuration.central_public_key) {
      throw new ClientSyncError('Esta sucursal ya está vinculada con una central.', 409);
    }
    const code = text(linkCode, 'El código de vínculo', 16_384, { required: true });
    const name = text(branchName, 'El nombre de la sucursal', 120, { required: true });
    if (!discoveryService?.discover) {
      throw new ClientSyncError('El descubrimiento LAN no está disponible.', 503);
    }
    const discoveryOptions = { linkCode: code };
    if (expectedCentralFingerprint) {
      discoveryOptions.expectedCentralFingerprint = expectedCentralFingerprint;
    }
    const endpoint = assertLanEndpoint(await discoveryService.discover(discoveryOptions));
    if (
      !endpoint?.centralPublicKey ||
      !verifyCentralFingerprint({
        publicKey: endpoint.centralPublicKey,
        fingerprint: endpoint.centralFingerprint,
      })
    ) {
      throw new ClientSyncError('La central descubierta no tiene una identidad válida.', 401);
    }
    try {
      verifyLinkCode({
        code,
        publicKey: endpoint.centralPublicKey,
        expectedCentralFingerprint: endpoint.centralFingerprint,
        now: now(),
      });
    } catch {
      throw new ClientSyncError('El código de vínculo no corresponde a la central descubierta.', 401);
    }
    const pairingRequestId = uuid(createUuid(), 'La solicitud');
    const envelope = signEnvelope({
      privateKey: local.privateKey,
      payload: {
        version: 1,
        type: 'clientes-link-request',
        requestId: pairingRequestId,
        issuedAt: now(),
        branchId: local.branchId,
        branchName: name,
        branchPublicKey: local.publicKey,
        linkCode: code,
      },
    });
    const responseEnvelope = await (transport || defaultTransport)(
      endpoint,
      envelope,
      '/api/clientes-sync/vincular'
    );
    const response = verifySignedEnvelope({
      envelope: responseEnvelope,
      publicKey: endpoint.centralPublicKey,
      expectedType: 'clientes-link-response',
      now: now(),
    });
    if (
      response.requestId !== pairingRequestId ||
      response.branchId !== local.branchId ||
      response.centralFingerprint !== endpoint.centralFingerprint
    ) {
      throw new ClientSyncError('La respuesta de vínculo no corresponde a esta sucursal.', 401);
    }
    const centralId = uuid(response.centralId, 'La central');
    const centralName = text(response.centralName, 'El nombre de la central', 120, { required: true });
    try {
      verifyBranchCredential({
        credential: response.credential,
        centralPublicKey: endpoint.centralPublicKey,
        expectedCentralFingerprint: endpoint.centralFingerprint,
        expectedBranchId: local.branchId,
        branchPublicKey: local.publicKey,
        now: now(),
      });
    } catch {
      throw new ClientSyncError('La central devolvió una credencial de sucursal no válida.', 401);
    }
    await store.transaction(async (transaction) => {
      await transaction.savePairing({
        branchId: local.branchId,
        centralId,
        centralName,
        centralFingerprint: endpoint.centralFingerprint,
        centralPublicKey: endpoint.centralPublicKey,
        credential: response.credential,
      });
    }, httpRequestId);
    return { centralId, centralFingerprint: endpoint.centralFingerprint };
  }

  async function linkBranch({ envelope, requestId } = {}) {
    const unsignedPayload = objectValue(envelope?.payload);
    const branchId = uuid(unsignedPayload.branchId, 'La sucursal');
    const branchPublicKey = text(unsignedPayload.branchPublicKey, 'La clave pública de la sucursal', 16_384, { required: true });
    const configuration = centralConfiguration(await store.readConfiguration());
    let payload;
    try {
      payload = verifySignedEnvelope({
        envelope,
        publicKey: createPublicKey(branchPublicKey),
        expectedType: 'clientes-link-request',
        now: now(),
      });
    } catch (error) {
      if (error instanceof ClientSyncError) throw error;
      throw new ClientSyncError('La solicitud de vínculo no tiene una firma válida.', 401);
    }
    verifyLinkCode({
      code: payload.linkCode,
      publicKey: configuration.central_public_key,
      expectedCentralFingerprint: configuration.central_fingerprint,
      now: now(),
    });
    const credential = nextCredential(configuration, branchId, branchPublicKey);
    await store.transaction(async (transaction) => {
      const existingBranch = await transaction.getBranch(branchId, { forUpdate: true });
      if (existingBranch && !existingBranch.activo) {
        throw new ClientSyncError(
          'La sucursal está inactiva y solo un administrador puede reactivarla.',
          409
        );
      }
      if (
        existingBranch?.publicKey &&
        fingerprintPublicKey(existingBranch.publicKey) !== fingerprintPublicKey(branchPublicKey)
      ) {
        throw new ClientSyncError(
          'La sucursal ya está vinculada con una clave de identidad diferente.',
          409
        );
      }
      await transaction.saveBranch({
        id: branchId,
        nombre: text(payload.branchName, 'El nombre de la sucursal', 120, { required: true }),
        rolNodo: 'sucursal',
        publicKey: branchPublicKey,
        keyFingerprint: fingerprintPublicKey(branchPublicKey),
        credential,
        activo: true,
      });
    }, requestId);
    return signEnvelope({
      privateKey: configuration.central_private_key,
      payload: {
        version: 1,
        type: 'clientes-link-response',
        requestId: payload.requestId,
        issuedAt: now(),
        branchId,
        centralId: uuid(configuration.sucursal_id, 'La central'),
        centralName: text(
          configuration.sucursal_nombre || 'Central de Clientes',
          'El nombre de la central',
          120,
          { required: true }
        ),
        centralFingerprint: configuration.central_fingerprint,
        credential,
      },
    });
  }

  async function acceptSync({ envelope, requestId } = {}) {
    const unsignedPayload = objectValue(envelope?.payload);
    const branchId = uuid(unsignedPayload.branchId, 'La sucursal');
    const configuration = centralConfiguration(await store.readConfiguration());
    const branch = await store.getBranch(branchId);
    if (!branch || !branch.activo || !branch.publicKey) {
      throw new ClientSyncError('La sucursal no está vinculada con esta central.', 401);
    }
    const payload = verifySignedEnvelope({
      envelope,
      publicKey: branch.publicKey,
      expectedType: 'clientes-sync-request',
      now: now(),
    });
    verifyBranchCredential({
      credential: payload.credential,
      centralPublicKey: configuration.central_public_key,
      expectedCentralFingerprint: configuration.central_fingerprint,
      expectedBranchId: branchId,
      branchPublicKey: branch.publicKey,
      now: now(),
    });
    if (!Array.isArray(payload.operations) || payload.operations.length > batchLimit) {
      throw new ClientSyncError(`El lote excede el límite de ${batchLimit} operaciones.`);
    }
    const lastReceivedCursor = boundedInteger(
      Number(payload.lastReceivedCursor),
      'El cursor recibido'
    );
    const operations = payload.operations.map(normalizeOperation);
    if (operations.some((entry) => entry.sucursalId !== branchId)) {
      throw new ClientSyncError('El lote contiene operaciones de otra sucursal.', 403);
    }
    const transactionResult = await store.transaction(async (transaction) => {
      const lockedBranch = await transaction.getBranch(branchId, { forUpdate: true });
      if (!lockedBranch || !lockedBranch.activo || !lockedBranch.publicKey) {
        throw new ClientSyncError('La sucursal no está vinculada o está inactiva.', 401);
      }
      if (
        fingerprintPublicKey(lockedBranch.publicKey) !== fingerprintPublicKey(branch.publicKey)
      ) {
        throw new ClientSyncError('La identidad vinculada de la sucursal cambió.', 401);
      }
      const usesCurrentCredential = payload.credential === lockedBranch.credential;
      if (!usesCurrentCredential) {
        const replayChecks = await Promise.all(
          operations.map((operation) => transaction.hasOperation(operation.id))
        );
        if (replayChecks.some((exists) => !exists)) {
          throw new ClientSyncError(
            'La credencial rotada ya no está vigente para operaciones nuevas.',
            401
          );
        }
      }
      const credential = usesCurrentCredential
        ? nextCredential(configuration, branchId, lockedBranch.publicKey)
        : lockedBranch.credential;
      const acknowledgedOperationIds = [];
      for (const operation of operations) {
        await applyIncomingOperation({
          store: transaction,
          operation,
          localBranchId: configuration.sucursal_id,
          createUuid,
        });
        acknowledgedOperationIds.push(operation.id);
      }
      if (usesCurrentCredential) {
        await transaction.saveBranchCredential({ branchId, credential });
      }
      const outgoing = await transaction.listOperationsAfter(lastReceivedCursor, batchLimit);
      return { acknowledgedOperationIds, outgoing, credential };
    }, requestId);
    const nextCursor = transactionResult.outgoing.reduce(
      (maximum, operation) => Math.max(maximum, operation.cursorLocal),
      lastReceivedCursor
    );
    return signEnvelope({
      privateKey: configuration.central_private_key,
      payload: {
        version: 1,
        type: 'clientes-sync-response',
        requestId: payload.requestId,
        issuedAt: now(),
        branchId,
        centralFingerprint: configuration.central_fingerprint,
        acknowledgedOperationIds: transactionResult.acknowledgedOperationIds,
        operations: transactionResult.outgoing,
        nextCursor,
        credential: transactionResult.credential,
      },
    });
  }

  async function defaultTransport(endpoint, envelope, path = '/api/clientes-sync/sincronizar') {
    assertLanEndpoint(endpoint);
    if (typeof fetchFn !== 'function') throw new Error('El transporte HTTP no está disponible.');
    const response = await fetchFn(`http://${endpoint.address}:${endpoint.port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(transportTimeoutMs),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new ClientSyncError(body?.error || 'La central rechazó la sincronización.', response.status);
    }
    return body;
  }

  async function syncOnce() {
    const configuration = branchConfiguration(await store.readConfiguration());
    const branchId = uuid(configuration.sucursal_id, 'La sucursal local');
    lastConnectivityStatus = 'offline';
    let endpoint = discoveryService?.getLastCentral?.() || null;
    if (!endpoint && discoveryService?.discover) {
      try {
        endpoint = await discoveryService.discover();
      } catch {
        return {
          status: 'offline',
          pending: await store.countPendingOperations(branchId),
        };
      }
    }
    if (!endpoint) {
      return { status: 'offline', pending: await store.countPendingOperations(branchId) };
    }
    assertLanEndpoint(endpoint);
    if (endpoint.centralFingerprint !== configuration.central_fingerprint) {
      throw new ClientSyncError('La central descubierta no coincide con la huella vinculada.', 401);
    }
    const pending = await store.listPendingOperations(branchId, batchLimit);
    const requestId = uuid(createUuid(), 'La solicitud');
    const envelope = signEnvelope({
      privateKey: configuration.sucursal_private_key,
      payload: {
        version: 1,
        type: 'clientes-sync-request',
        requestId,
        issuedAt: now(),
        branchId,
        credential: configuration.sucursal_credential,
        lastReceivedCursor: Number(configuration.ultimo_cursor_recibido || 0),
        operations: pending.map(mapOperationRow),
      },
    });
    const responseEnvelope = await (transport || defaultTransport)(
      endpoint,
      envelope,
      '/api/clientes-sync/sincronizar'
    );
    const response = verifySignedEnvelope({
      envelope: responseEnvelope,
      publicKey: configuration.central_public_key,
      expectedType: 'clientes-sync-response',
      now: now(),
    });
    if (
      response.requestId !== requestId ||
      response.branchId !== branchId ||
      response.centralFingerprint !== configuration.central_fingerprint
    ) {
      throw new ClientSyncError('La respuesta firmada no corresponde a esta sincronización.', 401);
    }
    verifyBranchCredential({
      credential: response.credential,
      centralPublicKey: configuration.central_public_key,
      expectedCentralFingerprint: configuration.central_fingerprint,
      expectedBranchId: branchId,
      branchPublicKey: configuration.sucursal_public_key,
      now: now(),
    });
    if (!Array.isArray(response.operations) || response.operations.length > batchLimit) {
      throw new ClientSyncError(`La respuesta excede el límite de ${batchLimit} operaciones.`);
    }
    if (!Array.isArray(response.acknowledgedOperationIds)) {
      throw new ClientSyncError('La respuesta no contiene acuses válidos.');
    }
    const sentIds = new Set(pending.map((entry) => entry.id));
    const acknowledgements = response.acknowledgedOperationIds.map((id) => uuid(id, 'El acuse'));
    if (acknowledgements.some((id) => !sentIds.has(id))) {
      throw new ClientSyncError('La respuesta contiene acuses de operaciones no enviadas.', 401);
    }
    const incoming = response.operations.map(normalizeOperation);
    const nextCursor = boundedInteger(Number(response.nextCursor), 'El cursor de respuesta');
    let conflicts = 0;
    await store.transaction(async (transaction) => {
      for (const operation of incoming) {
        const result = await applyIncomingOperation({
          store: transaction,
          operation,
          localBranchId: branchId,
          createUuid,
        });
        if (result.conflict) conflicts += 1;
      }
      await transaction.markOperationsSynced(acknowledgements);
      await transaction.saveLocalSyncState({
        branchId,
        cursor: nextCursor,
        credential: response.credential,
      });
    });
    lastConnectivityStatus = 'conectado';
    return {
      status: 'synchronized',
      sent: pending.length,
      received: incoming.length,
      conflicts,
      pending: await store.countPendingOperations(branchId),
    };
  }

  async function backgroundAttempt() {
    if (!running) return;
    let delay;
    try {
      const result = await syncOnce();
      if (result.status === 'offline') {
        delay = nextRetryDelay;
        nextRetryDelay = Math.min(nextRetryDelay * 2, retryMaxMs);
      } else {
        nextRetryDelay = retryBaseMs;
        delay = syncIntervalMs;
      }
    } catch {
      delay = nextRetryDelay;
      nextRetryDelay = Math.min(nextRetryDelay * 2, retryMaxMs);
    } finally {
      if (running) syncTimer = setTimeoutFn(backgroundAttempt, delay);
    }
  }

  return {
    acceptSync,
    configureNode,
    createPairingCode,
    getStatus,
    linkBranch,
    pairWithCentral,
    syncOnce,
    async start() {
      const startGeneration = ++lifecycleGeneration;
      const configuration = await store.readConfiguration();
      if (startGeneration !== lifecycleGeneration) return;
      running = String(configuration.rol_nodo || '').toLowerCase() === 'sucursal';
      nextRetryDelay = retryBaseMs;
      if (running && !syncTimer) syncTimer = setTimeoutFn(backgroundAttempt, 0);
    },
    async stop() {
      running = false;
      lifecycleGeneration += 1;
      if (syncTimer) clearTimeoutFn(syncTimer);
      syncTimer = undefined;
    },
  };
}

module.exports = {
  ClientSyncError,
  canonicalJson,
  createClientSyncService,
  createSqlSyncStore,
  isPrivateLanAddress,
  signEnvelope,
  verifySignedEnvelope,
};
