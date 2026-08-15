const { randomUUID } = require('node:crypto');
const { releaseConnection, rollbackTransaction } = require('../middleware/errors');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 100;
const MAX_PAGINATION_OFFSET = 1_000_000;

class ClientesServiceError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'ClientesServiceError';
    this.status = status;
    this.isPublic = true;
  }
}

function normalizeUuid(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new ClientesServiceError(`${fieldName} no es válido.`);
  }
  return normalized.toLowerCase();
}

function generatedUuid(createUuid) {
  const value = createUuid();
  if (!UUID_PATTERN.test(String(value || ''))) {
    throw new Error('El generador de UUID produjo un identificador inválido.');
  }
  return String(value).toLowerCase();
}

function optionalText(value, fieldName, maximumLength, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maximumLength) {
    throw new ClientesServiceError(`${fieldName} excede ${maximumLength} caracteres.`);
  }
  return normalized;
}

function customerName(value, fallback) {
  const normalized = optionalText(value, 'El nombre', 180, fallback);
  if (!normalized) throw new ClientesServiceError('El nombre del cliente es obligatorio.');
  return normalized;
}

function emailAddress(value, fallback = null) {
  const normalized = optionalText(value, 'El correo', 254, fallback);
  if (normalized === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ClientesServiceError('El correo del cliente no es válido.');
  }
  return normalized.toLowerCase();
}

function actorIdentifier(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function money(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 999999999999.99) {
    throw new ClientesServiceError('El total de la compra no es válido.');
  }
  return Math.round((normalized + Number.EPSILON) * 100) / 100;
}

function jsonText(value, fieldName) {
  if (value === undefined || value === null) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError('not JSON serializable');
    return serialized;
  } catch {
    throw new ClientesServiceError(`${fieldName} no contiene JSON válido.`);
  }
}

function purchaseDate(value) {
  const supplied = value !== undefined && value !== null && value !== '';
  const normalized = supplied ? String(value).trim() : new Date().toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(normalized);
  const parsed = new Date(normalized);
  if (
    !match ||
    Number.isNaN(parsed.getTime()) ||
    Number(match?.[1]) < 1000 ||
    Number(match?.[1]) > 9999 ||
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[3]) ||
    parsed.getUTCHours() !== Number(match[4]) ||
    parsed.getUTCMinutes() !== Number(match[5]) ||
    parsed.getUTCSeconds() !== Number(match[6])
  ) {
    throw new ClientesServiceError('La fecha de compra no es válida.');
  }
  const iso = parsed.toISOString();
  return {
    iso,
    databaseValue: iso.slice(0, 23).replace('T', ' ')
  };
}

function paginationInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) {
    throw new ClientesServiceError(`La paginación contiene una ${fieldName} no válida.`);
  }
  const normalized = Number(text);
  if (!Number.isSafeInteger(normalized)) {
    throw new ClientesServiceError(`La paginación contiene una ${fieldName} fuera de rango.`);
  }
  return normalized;
}

function pagination({ pagina, limite } = {}) {
  const requestedPage = paginationInteger(pagina, 1, 'página');
  const requestedLimit = paginationInteger(limite, 25, 'cantidad');
  const boundedLimit = Math.min(requestedLimit, MAX_PAGE_SIZE);
  const offset = (requestedPage - 1) * boundedLimit;
  if (!Number.isSafeInteger(offset) || offset > MAX_PAGINATION_OFFSET) {
    throw new ClientesServiceError('La paginación solicitada está fuera de rango.');
  }
  return {
    pagina: requestedPage,
    limite: boundedLimit
  };
}

function activeFilter(value) {
  const normalized = String(value === undefined ? 'activo' : value).toLowerCase();
  if (normalized === 'todos' || normalized === 'all') return null;
  if (['0', 'false', 'inactivo', 'inactivos'].includes(normalized)) return 0;
  if (['1', 'true', 'activo', 'activos'].includes(normalized)) return 1;
  throw new ClientesServiceError('El filtro de estado no es válido.');
}

function mapCliente(row) {
  return { ...row, activo: Boolean(row.activo), version: Number(row.version) };
}

function parsedJson(value) {
  if (value === null || value === undefined || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function mapPurchase(row) {
  return {
    ...row,
    total: Number(row.total),
    detalle: parsedJson(row.detalle),
    version: Number(row.version)
  };
}

function isDuplicateFolioError(error, folio) {
  if (folio === null || (error?.code !== 'ER_DUP_ENTRY' && error?.errno !== 1062)) return false;
  const databaseMessage = `${error?.sqlMessage || ''} ${error?.message || ''}`;
  return /uq_cliente_compras_sucursal_folio/i.test(databaseMessage);
}

async function localBranchId(connection) {
  const [rows] = await connection.execute(
    `SELECT sucursal_id
       FROM cliente_configuracion
      WHERE alcance_local = 1
      LIMIT 1
      FOR UPDATE`
  );
  if (rows.length !== 1) {
    throw new ClientesServiceError('Esta instalación no tiene una sucursal local configurada.', 409);
  }
  return normalizeUuid(rows[0].sucursal_id, 'La sucursal local');
}

async function inTransaction(database, requestId, work) {
  let connection;
  let transactionStarted = false;
  try {
    connection = await database.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (transactionStarted) await rollbackTransaction(connection, requestId);
    throw error;
  } finally {
    releaseConnection(connection, requestId);
  }
}

async function recordMutation(connection, createUuid, {
  branchId,
  actorId,
  entity,
  entityId,
  action,
  version,
  payload,
  auditDetail = payload
}) {
  const operationId = generatedUuid(createUuid);
  const auditId = generatedUuid(createUuid);
  await connection.execute(
    `INSERT INTO cliente_operaciones_sync
       (id, sucursal_id, entidad, entidad_id, tipo_operacion, payload, version, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
    [operationId, branchId, entity, entityId, action, JSON.stringify(payload), version]
  );
  await connection.execute(
    `INSERT INTO cliente_bitacora
       (id, sucursal_id, usuario_id, entidad, entidad_id, accion, detalle)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [auditId, branchId, actorIdentifier(actorId), entity, entityId, action, JSON.stringify(auditDetail)]
  );
}

function createClientesService({
  database = require('../config/database'),
  createUuid = randomUUID
} = {}) {
  if (!database || typeof database.execute !== 'function' || typeof database.getConnection !== 'function') {
    throw new TypeError('Se requiere una conexión de base de datos válida.');
  }
  if (typeof createUuid !== 'function') throw new TypeError('Se requiere un generador de UUID.');

  return {
    async listClientes({ pagina, limite, buscar = '', activo } = {}) {
      const page = pagination({ pagina, limite });
      const search = String(buscar || '').trim();
      if (search.length > 120) throw new ClientesServiceError('La búsqueda es demasiado larga.');
      const desiredActive = activeFilter(activo);
      const clauses = [];
      const parameters = [];
      if (search) {
        const term = `%${search}%`;
        clauses.push('(nombre LIKE ? OR telefono LIKE ? OR correo LIKE ?)');
        parameters.push(term, term, term);
      }
      if (desiredActive !== null) {
        clauses.push('activo = ?');
        parameters.push(desiredActive);
      }
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const [countRows] = await database.execute(
        `SELECT COUNT(*) AS total FROM clientes${where}`,
        parameters
      );
      const total = Number(countRows[0]?.total || 0);
      const offset = (page.pagina - 1) * page.limite;
      const [rows] = await database.execute(
        `SELECT id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version,
                creado_en, actualizado_en
           FROM clientes${where}
          ORDER BY actualizado_en DESC, nombre ASC, id ASC
          LIMIT ? OFFSET ?`,
        [...parameters, page.limite, offset]
      );
      return {
        data: rows.map(mapCliente),
        paginacion: {
          ...page,
          total,
          totalPaginas: Math.ceil(total / page.limite)
        }
      };
    },

    async getCliente({ clienteId } = {}) {
      const id = normalizeUuid(clienteId, 'El cliente');
      const [rows] = await database.execute(
        `SELECT id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version,
                creado_en, actualizado_en
           FROM clientes
          WHERE id = ?
          LIMIT 1`,
        [id]
      );
      if (rows.length !== 1) throw new ClientesServiceError('El cliente no existe.', 404);
      return mapCliente(rows[0]);
    },

    async listPurchases({ clienteId, pagina, limite } = {}) {
      const id = normalizeUuid(clienteId, 'El cliente');
      const page = pagination({ pagina, limite });
      const [countRows] = await database.execute(
        'SELECT COUNT(*) AS total FROM cliente_compras WHERE cliente_id = ?',
        [id]
      );
      const total = Number(countRows[0]?.total || 0);
      const offset = (page.pagina - 1) * page.limite;
      const [rows] = await database.execute(
        `SELECT id, cliente_id, sucursal_id, folio_ticket, total, detalle, fecha_compra,
                version, creado_en, actualizado_en
           FROM cliente_compras
          WHERE cliente_id = ?
          ORDER BY fecha_compra DESC, id DESC
          LIMIT ? OFFSET ?`,
        [id, page.limite, offset]
      );
      return {
        data: rows.map(mapPurchase),
        paginacion: {
          ...page,
          total,
          totalPaginas: Math.ceil(total / page.limite)
        }
      };
    },

    async createCliente({ nombre, telefono, correo, notas, actorId, requestId } = {}) {
      const normalized = {
        nombre: customerName(nombre),
        telefono: optionalText(telefono, 'El teléfono', 40),
        correo: emailAddress(correo),
        notas: optionalText(notas, 'Las notas', 65_535)
      };
      return inTransaction(database, requestId, async (connection) => {
        const branchId = await localBranchId(connection);
        const id = generatedUuid(createUuid);
        const client = {
          id,
          origen_sucursal_id: branchId,
          ...normalized,
          activo: true,
          version: 1
        };
        await connection.execute(
          `INSERT INTO clientes
             (id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, branchId, normalized.nombre, normalized.telefono, normalized.correo, normalized.notas, 1, 1]
        );
        await recordMutation(connection, createUuid, {
          branchId,
          actorId,
          entity: 'cliente',
          entityId: id,
          action: 'crear',
          version: 1,
          payload: client
        });
        return client;
      });
    },

    async updateCliente({ clienteId, nombre, telefono, correo, notas, actorId, requestId } = {}) {
      const id = normalizeUuid(clienteId, 'El cliente');
      return inTransaction(database, requestId, async (connection) => {
        const branchId = await localBranchId(connection);
        const [rows] = await connection.execute(
          `SELECT id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version
             FROM clientes
            WHERE id = ?
            FOR UPDATE`,
          [id]
        );
        if (rows.length !== 1) throw new ClientesServiceError('El cliente no existe.', 404);
        if (!rows[0].activo) throw new ClientesServiceError('El cliente está desactivado.', 409);
        const client = {
          id,
          origen_sucursal_id: rows[0].origen_sucursal_id,
          nombre: customerName(nombre, rows[0].nombre),
          telefono: optionalText(telefono, 'El teléfono', 40, rows[0].telefono),
          correo: emailAddress(correo, rows[0].correo),
          notas: optionalText(notas, 'Las notas', 65_535, rows[0].notas),
          activo: true,
          version: Number(rows[0].version) + 1
        };
        await connection.execute(
          `UPDATE clientes
              SET nombre = ?, telefono = ?, correo = ?, notas = ?, version = ?
            WHERE id = ?`,
          [client.nombre, client.telefono, client.correo, client.notas, client.version, id]
        );
        await recordMutation(connection, createUuid, {
          branchId,
          actorId,
          entity: 'cliente',
          entityId: id,
          action: 'editar',
          version: client.version,
          payload: client,
          auditDetail: { anterior: mapCliente(rows[0]), actual: client }
        });
        return client;
      });
    },

    async deactivateCliente({ clienteId, actorId, requestId } = {}) {
      const id = normalizeUuid(clienteId, 'El cliente');
      return inTransaction(database, requestId, async (connection) => {
        const branchId = await localBranchId(connection);
        const [rows] = await connection.execute(
          `SELECT id, origen_sucursal_id, nombre, telefono, correo, notas, activo, version
             FROM clientes
            WHERE id = ?
            FOR UPDATE`,
          [id]
        );
        if (rows.length !== 1) throw new ClientesServiceError('El cliente no existe.', 404);
        if (!rows[0].activo) throw new ClientesServiceError('El cliente ya está desactivado.', 409);
        const client = {
          ...mapCliente(rows[0]),
          activo: false,
          version: Number(rows[0].version) + 1
        };
        await connection.execute(
          'UPDATE clientes SET activo = 0, version = ? WHERE id = ?',
          [client.version, id]
        );
        await recordMutation(connection, createUuid, {
          branchId,
          actorId,
          entity: 'cliente',
          entityId: id,
          action: 'desactivar',
          version: client.version,
          payload: client,
          auditDetail: { anterior: mapCliente(rows[0]), actual: client }
        });
        return client;
      });
    },

    async registerPurchase({
      clienteId,
      folio_ticket,
      total,
      detalle,
      fecha_compra,
      actorId,
      requestId
    } = {}) {
      const customerId = normalizeUuid(clienteId, 'El cliente');
      const folio = optionalText(folio_ticket, 'El folio', 100);
      const normalizedTotal = money(total);
      const serializedDetail = jsonText(detalle, 'El detalle');
      const date = purchaseDate(fecha_compra);
      return inTransaction(database, requestId, async (connection) => {
        const branchId = await localBranchId(connection);
        const [customerRows] = await connection.execute(
          'SELECT id, activo FROM clientes WHERE id = ? FOR UPDATE',
          [customerId]
        );
        if (customerRows.length !== 1) throw new ClientesServiceError('El cliente no existe.', 404);
        if (!customerRows[0].activo) throw new ClientesServiceError('El cliente está desactivado.', 409);
        const id = generatedUuid(createUuid);
        const purchase = {
          id,
          cliente_id: customerId,
          sucursal_id: branchId,
          folio_ticket: folio,
          total: normalizedTotal,
          detalle: detalle === undefined ? null : detalle,
          fecha_compra: date.iso,
          version: 1
        };
        try {
          await connection.execute(
            `INSERT INTO cliente_compras
               (id, cliente_id, sucursal_id, folio_ticket, total, detalle, fecha_compra, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, customerId, branchId, folio, normalizedTotal, serializedDetail, date.databaseValue, 1]
          );
        } catch (error) {
          if (isDuplicateFolioError(error, folio)) {
            throw new ClientesServiceError('El folio ya existe en esta sucursal.', 409);
          }
          throw error;
        }
        await recordMutation(connection, createUuid, {
          branchId,
          actorId,
          entity: 'compra',
          entityId: id,
          action: 'crear',
          version: 1,
          payload: purchase
        });
        return purchase;
      });
    }
  };
}

module.exports = { ClientesServiceError, createClientesService };
