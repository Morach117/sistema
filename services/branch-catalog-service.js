const { randomUUID } = require('node:crypto');
const database = require('../config/database');
const {
  ClientSyncError,
  isTailscaleAddress,
  signEnvelope,
  verifySignedEnvelope,
} = require('./client-sync-service');
const { verifyBranchCredential } = require('./client-identity-service');

const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_REMOTE_BRANCHES = 64;

function cleanCode(value) {
  const code = String(value || '').trim();
  if (!code || code.length > 120) throw new ClientSyncError('El código a consultar no es válido.', 422);
  return code;
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 120) || 'Sucursal sin nombre';
}

function uuid(value, fieldName) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ClientSyncError(`${fieldName} no es válido.`, 400);
  }
  return normalized;
}

function responseEntry({ branchId, branchName, product, includePrices }) {
  if (!product) return null;
  const entry = {
    sucursalId: branchId,
    sucursal: cleanName(branchName),
    claveSicar: product.clave_sicar || null,
    codigoBarras: product.codigo_barras || null,
    descripcion: product.descripcion || null,
  };
  if (includePrices) entry.precioVenta = Number(product.precio_venta || 0);
  return entry;
}

function sanitizeEntries(entries, includePrices) {
  return entries.flatMap((entry) => {
    if (!entry || !entry.codigoBarras) return [];
    const safe = {
      sucursalId: entry.sucursalId,
      sucursal: cleanName(entry.sucursal),
      claveSicar: entry.claveSicar || null,
      codigoBarras: String(entry.codigoBarras),
      descripcion: entry.descripcion || null,
    };
    if (includePrices && Number.isFinite(Number(entry.precioVenta))) {
      safe.precioVenta = Number(entry.precioVenta);
    }
    return [safe];
  });
}

function createSqlBranchCatalogStore({ executor = database } = {}) {
  if (!executor || typeof executor.execute !== 'function') throw new TypeError('Se requiere una base de datos válida.');
  return {
    async readConfiguration() {
      const [rows] = await executor.execute(
        `SELECT configuracion.sucursal_id, configuracion.rol_nodo,
                configuracion.central_fingerprint, configuracion.central_public_key,
                configuracion.central_private_key, configuracion.sucursal_public_key,
                configuracion.sucursal_private_key, configuracion.sucursal_credential,
                sucursal.nombre AS sucursal_nombre
           FROM cliente_configuracion AS configuracion
           LEFT JOIN sucursales AS sucursal ON sucursal.id = configuracion.sucursal_id
          WHERE configuracion.alcance_local = 1
          LIMIT 1`
      );
      if (rows.length !== 1) throw new ClientSyncError('Esta instalación no tiene identidad de sucursal configurada.', 409);
      return rows[0];
    },
    async getBranch(branchId) {
      const [rows] = await executor.execute(
        'SELECT id, nombre, public_key, credential, activo FROM sucursales WHERE id = ? LIMIT 1',
        [branchId]
      );
      return rows[0] || null;
    },
    async findProduct(code) {
      const [rows] = await executor.execute(
        `SELECT clave_sicar, codigo_barras, descripcion, precio_venta
           FROM cat_productos
          WHERE clave_sicar = ? OR codigo_barras = ?
          LIMIT 1`,
        [code, code]
      );
      return rows[0] || null;
    },
  };
}

function createBranchCatalogService({
  store = createSqlBranchCatalogStore(),
  remoteDiscoveryService,
  listPeers = async () => [],
  fetchFn = globalThis.fetch,
  apiPort = Number(process.env.PORT || 3000),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  if (typeof fetchFn !== 'function') throw new TypeError('El transporte HTTP no está disponible.');
  const port = Number(apiPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new TypeError('El puerto de red no es válido.');

  function remotePort(value) {
    const normalized = Number(value || port);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 65_535) {
      throw new ClientSyncError('El puerto remoto no es válido.', 403);
    }
    return normalized;
  }

  async function post(address, path, envelope, destinationPort) {
    if (!isTailscaleAddress(address)) throw new ClientSyncError('La dirección remota no pertenece a Tailscale.', 403);
    const response = await fetchFn(`http://${address}:${remotePort(destinationPort)}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ClientSyncError(body?.error || 'La sucursal remota no pudo atender la consulta.', response.status);
    return body;
  }

  async function get(address, path, destinationPort) {
    if (!isTailscaleAddress(address)) throw new ClientSyncError('La dirección remota no pertenece a Tailscale.', 403);
    const response = await fetchFn(`http://${address}:${remotePort(destinationPort)}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ClientSyncError(body?.error || 'La sucursal remota no pudo atender la consulta.', response.status);
    return body;
  }

  async function localEntry(configuration, code, includePrices) {
    const product = await store.findProduct(code);
    return responseEntry({
      branchId: configuration.sucursal_id,
      branchName: configuration.sucursal_nombre,
      product,
      includePrices,
    });
  }

  async function announceBranch() {
    const configuration = await store.readConfiguration();
    if (String(configuration.rol_nodo || '').toLowerCase() !== 'sucursal') {
      throw new ClientSyncError('Solo una sucursal puede anunciar su catálogo.', 409);
    }
    return signEnvelope({
      privateKey: configuration.sucursal_private_key,
      payload: {
        version: 1,
        type: 'branch-catalog-announcement',
        issuedAt: now(),
        branchId: configuration.sucursal_id,
        branchName: cleanName(configuration.sucursal_nombre),
      },
    });
  }

  async function receiveCentralLookup({ envelope }) {
    const configuration = await store.readConfiguration();
    if (String(configuration.rol_nodo || '').toLowerCase() !== 'sucursal') {
      throw new ClientSyncError('Esta instalación no es una sucursal.', 409);
    }
    const payload = verifySignedEnvelope({
      envelope,
      publicKey: configuration.central_public_key,
      expectedType: 'central-catalog-query',
      now,
    });
    if (payload.centralFingerprint !== configuration.central_fingerprint) {
      throw new ClientSyncError('La central de la consulta no coincide con la vinculada.', 401);
    }
    const code = cleanCode(payload.code);
    const product = await store.findProduct(code);
    return signEnvelope({
      privateKey: configuration.sucursal_private_key,
      payload: {
        version: 1,
        type: 'branch-catalog-response',
        issuedAt: now(),
        requestId: payload.requestId,
        branchId: configuration.sucursal_id,
        entry: responseEntry({
          branchId: configuration.sucursal_id,
          branchName: configuration.sucursal_nombre,
          product,
          includePrices: payload.includePrices === true,
        }),
      },
    });
  }

  async function queryPeer({ peer, configuration, code, includePrices }) {
    if (!isTailscaleAddress(peer?.address)) return null;
    const announcement = await get(peer.address, '/api/catalogo-sucursales/anuncio-remoto');
    const raw = announcement?.payload;
    const branchId = uuid(raw?.branchId, 'La sucursal remota');
    const branch = await store.getBranch(branchId);
    if (!branch?.activo || !branch.public_key) return null;
    const verifiedAnnouncement = verifySignedEnvelope({
      envelope: announcement,
      publicKey: branch.public_key,
      expectedType: 'branch-catalog-announcement',
      now,
    });
    const requestId = randomUUID();
    const response = await post(peer.address, '/api/catalogo-sucursales/consulta-central-remota', signEnvelope({
      privateKey: configuration.central_private_key,
      payload: {
        version: 1,
        type: 'central-catalog-query',
        issuedAt: now(),
        requestId,
        centralFingerprint: configuration.central_fingerprint,
        code,
        includePrices: includePrices === true,
      },
    }));
    const payload = verifySignedEnvelope({
      envelope: response,
      publicKey: branch.public_key,
      expectedType: 'branch-catalog-response',
      now,
    });
    if (payload.requestId !== requestId || uuid(payload.branchId, 'La sucursal remota') !== verifiedAnnouncement.branchId) {
      throw new ClientSyncError('La respuesta de catálogo no corresponde a la sucursal consultada.', 401);
    }
    return payload.entry || null;
  }

  async function collectAtCentral({ configuration, code, includePrices }) {
    const own = await localEntry(configuration, code, includePrices);
    const peers = (await listPeers()).filter((peer) => isTailscaleAddress(peer?.address)).slice(0, MAX_REMOTE_BRANCHES);
    const remote = await Promise.allSettled(peers.map((peer) => queryPeer({ peer, configuration, code, includePrices })));
    return sanitizeEntries([
      own,
      ...remote.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []),
    ], includePrices);
  }

  async function receiveBranchLookup({ envelope }) {
    const configuration = await store.readConfiguration();
    if (String(configuration.rol_nodo || '').toLowerCase() !== 'central') {
      throw new ClientSyncError('Esta instalación no es una Central.', 409);
    }
    const unsigned = envelope?.payload || {};
    const branchId = uuid(unsigned.branchId, 'La sucursal');
    const branch = await store.getBranch(branchId);
    if (!branch?.activo || !branch.public_key || !branch.credential) {
      throw new ClientSyncError('La sucursal no está vinculada.', 401);
    }
    const payload = verifySignedEnvelope({ envelope, publicKey: branch.public_key, expectedType: 'branch-catalog-query', now });
    try {
      verifyBranchCredential({
        credential: payload.credential,
        centralPublicKey: configuration.central_public_key,
        expectedCentralFingerprint: configuration.central_fingerprint,
        expectedBranchId: branchId,
        branchPublicKey: branch.public_key,
        now: now(),
      });
    } catch {
      throw new ClientSyncError('La credencial de la sucursal no es válida.', 401);
    }
    const entries = await collectAtCentral({
      configuration,
      code: cleanCode(payload.code),
      includePrices: payload.includePrices === true,
    });
    return signEnvelope({
      privateKey: configuration.central_private_key,
      payload: {
        version: 1,
        type: 'central-catalog-response',
        issuedAt: now(),
        requestId: payload.requestId,
        entries,
      },
    });
  }

  async function resolveForReception({ code, includePrices = false }) {
    const configuration = await store.readConfiguration();
    const normalizedCode = cleanCode(code);
    if (String(configuration.rol_nodo || '').toLowerCase() === 'central') {
      return { entries: await collectAtCentral({ configuration, code: normalizedCode, includePrices }) };
    }
    if (String(configuration.rol_nodo || '').toLowerCase() !== 'sucursal') {
      throw new ClientSyncError('Esta instalación no tiene un rol de red válido.', 409);
    }
    const endpoint = remoteDiscoveryService?.getLastCentral?.()
      || await remoteDiscoveryService?.discover?.({ expectedCentralFingerprint: configuration.central_fingerprint });
    if (!endpoint?.address || !isTailscaleAddress(endpoint.address)) {
      throw new ClientSyncError('No hay una Central conectada para consultar sucursales.', 503);
    }
    const requestId = randomUUID();
    const response = await post(endpoint.address, '/api/catalogo-sucursales/consulta-sucursal-remota', signEnvelope({
      privateKey: configuration.sucursal_private_key,
      payload: {
        version: 1,
        type: 'branch-catalog-query',
        issuedAt: now(),
        requestId,
        branchId: configuration.sucursal_id,
        credential: configuration.sucursal_credential,
        code: normalizedCode,
        includePrices: includePrices === true,
      },
    }), endpoint.port);
    const payload = verifySignedEnvelope({
      envelope: response,
      publicKey: configuration.central_public_key,
      expectedType: 'central-catalog-response',
      now,
    });
    if (payload.requestId !== requestId) throw new ClientSyncError('La respuesta de la Central no corresponde a la consulta.', 401);
    return { entries: sanitizeEntries(payload.entries || [], includePrices) };
  }

  return { announceBranch, receiveBranchLookup, receiveCentralLookup, resolveForReception };
}

module.exports = { createBranchCatalogService, createSqlBranchCatalogStore, sanitizeEntries };
