const dgram = require('node:dgram');
const os = require('node:os');
const {
  verifyCentralFingerprint,
  verifyLinkCode,
} = require('./client-identity-service');
const {
  signEnvelope,
  verifySignedEnvelope,
} = require('./client-sync-service');

const DEFAULT_DISCOVERY_PORT = 39091;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 2_000;
const DEFAULT_CANDIDATE_TTL_MS = 15_000;
const MAX_CANDIDATES = 32;
const MAX_PACKET_SIZE = 32 * 1024;

function ipv4Number(address) {
  const parts = String(address || '').split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = ((value << 8) | octet) >>> 0;
  }
  return value;
}

function numberIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function directedBroadcasts(interfaces) {
  const addresses = new Set();
  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      if (entry.internal || (entry.family !== 'IPv4' && entry.family !== 4)) continue;
      const address = ipv4Number(entry.address);
      const netmask = ipv4Number(entry.netmask);
      if (address === null || netmask === null) continue;
      addresses.add(numberIpv4(((address & netmask) | (~netmask >>> 0)) >>> 0));
    }
  }
  return [...addresses];
}

function isAddressOnLocalSubnet(address, interfaces) {
  const remote = ipv4Number(address);
  if (remote === null) return false;
  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      if (entry.internal || (entry.family !== 'IPv4' && entry.family !== 4)) continue;
      const local = ipv4Number(entry.address);
      const netmask = ipv4Number(entry.netmask);
      if (local === null || netmask === null) continue;
      if ((remote & netmask) === (local & netmask)) return true;
    }
  }
  return false;
}

function safePort(value, fieldName) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError(`${fieldName} no es un puerto válido.`);
  }
  return port;
}

function createClientDiscoveryService({
  createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }),
  getConfiguration = async () => {
    const [rows] = await require('../config/database').execute(
      `SELECT configuracion.rol_nodo, configuracion.central_fingerprint,
              configuracion.central_public_key, configuracion.central_private_key,
              sucursal.nombre AS sucursal_nombre
         FROM cliente_configuracion AS configuracion
         INNER JOIN sucursales AS sucursal ON sucursal.id = configuracion.sucursal_id
        WHERE configuracion.alcance_local = 1
        LIMIT 1`
    );
    if (rows.length !== 1) throw new Error('No hay identidad LAN configurada.');
    return rows[0];
  },
  networkInterfaces = os.networkInterfaces,
  discoveryPort = DEFAULT_DISCOVERY_PORT,
  apiPort = Number(process.env.PORT || 3000),
  discoveryTimeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
  announceIntervalMs = 5_000,
  candidateTtlMs = DEFAULT_CANDIDATE_TTL_MS,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  const udpPort = safePort(discoveryPort, 'discoveryPort');
  const localApiPort = safePort(apiPort, 'apiPort');
  if (!Number.isInteger(discoveryTimeoutMs) || discoveryTimeoutMs < 1) {
    throw new TypeError('discoveryTimeoutMs debe ser un entero positivo.');
  }
  if (!Number.isInteger(candidateTtlMs) || candidateTtlMs < 1) {
    throw new TypeError('candidateTtlMs debe ser un entero positivo.');
  }
  let socket;
  let configuration;
  let startPromise;
  let started = false;
  let stopped = false;
  let announcementTimer;
  let lastCentral = null;
  let lifecycleGeneration = 0;
  const waiters = new Set();
  const candidates = new Map();

  function send(packet, address, port = udpPort) {
    if (!socket || stopped) return;
    const contents = Buffer.from(JSON.stringify(packet), 'utf8');
    if (contents.length > MAX_PACKET_SIZE) throw new Error('El anuncio LAN excede el tamaño permitido.');
    socket.send(contents, port, address, () => {});
  }

  function broadcasts() {
    return directedBroadcasts(networkInterfaces());
  }

  function announcementEnvelope() {
    return signEnvelope({
      privateKey: configuration.central_private_key,
      payload: {
        version: 1,
        type: 'clientes-central-announcement',
        centralName: configuration.sucursal_nombre,
        centralFingerprint: configuration.central_fingerprint,
        centralPublicKey: configuration.central_public_key,
        apiPort: localApiPort,
        issuedAt: now(),
      },
    });
  }

  function announce(address) {
    if (String(configuration?.rol_nodo || '').toLowerCase() !== 'central') return;
    if (address) send(announcementEnvelope(), address);
    else for (const broadcast of broadcasts()) send(announcementEnvelope(), broadcast);
  }

  function resolveWaiters(endpoint) {
    for (const waiter of waiters) {
      clearTimeoutFn(waiter.timer);
      waiter.resolve({ ...endpoint });
    }
    waiters.clear();
  }

  function resolveMatchingPairingWaiters(endpoint, publicKey, fingerprint) {
    let accepted = false;
    for (const waiter of [...waiters]) {
      try {
        verifyLinkCode({
          code: waiter.linkCode,
          publicKey,
          expectedCentralFingerprint: fingerprint,
          now: now(),
        });
        clearTimeoutFn(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve({ ...endpoint });
        accepted = true;
      } catch {
        // This announcement does not match the operator-provided activation code.
      }
    }
    return accepted;
  }

  function removeExpiredCandidates() {
    const expiresBefore = now() - candidateTtlMs;
    for (const [fingerprint, candidate] of candidates) {
      if (candidate.seenAt < expiresBefore) candidates.delete(fingerprint);
    }
  }

  function rememberCandidate({ name, fingerprint }) {
    removeExpiredCandidates();
    const candidate = { name, fingerprint, seenAt: now() };
    candidates.delete(fingerprint);
    candidates.set(fingerprint, candidate);
    while (candidates.size > MAX_CANDIDATES) {
      candidates.delete(candidates.keys().next().value);
    }
  }

  function handleMessage(message, remote) {
    if (!Buffer.isBuffer(message) || message.length > MAX_PACKET_SIZE) return;
    let parsed;
    try {
      parsed = JSON.parse(message.toString('utf8'));
    } catch {
      return;
    }
    const role = String(configuration?.rol_nodo || '').toLowerCase();
    if (parsed?.type === 'clientes-central-discovery') {
      if (
        role === 'central' &&
        remote?.address &&
        isAddressOnLocalSubnet(remote.address, networkInterfaces())
      ) announce(remote.address);
      return;
    }
    if (role !== 'sucursal' || parsed?.payload?.type !== 'clientes-central-announcement') return;
    const payload = parsed.payload;
    const isPinned = Boolean(configuration.central_fingerprint && configuration.central_public_key);
    if (isPinned && (
      payload.centralFingerprint !== configuration.central_fingerprint ||
      payload.centralPublicKey !== configuration.central_public_key
    )) return;
    if (!verifyCentralFingerprint({
      publicKey: payload.centralPublicKey,
      fingerprint: payload.centralFingerprint,
    })) return;
    try {
      verifySignedEnvelope({
        envelope: parsed,
        publicKey: payload.centralPublicKey,
        expectedType: 'clientes-central-announcement',
        now: now(),
      });
      const port = safePort(payload.apiPort, 'apiPort');
      if (!remote?.address || !isAddressOnLocalSubnet(remote.address, networkInterfaces())) return;
      const endpoint = {
        address: remote.address,
        port,
        centralFingerprint: payload.centralFingerprint,
      };
      const centralName = String(payload.centralName || '').trim();
      if (centralName && centralName.length <= 120) {
        rememberCandidate({
          name: centralName,
          fingerprint: payload.centralFingerprint,
        });
      }
      if (isPinned) {
        lastCentral = endpoint;
        resolveWaiters(lastCentral);
      } else {
        const pairingEndpoint = { ...endpoint, centralPublicKey: payload.centralPublicKey };
        if (resolveMatchingPairingWaiters(
          pairingEndpoint,
          payload.centralPublicKey,
          payload.centralFingerprint
        )) {
          lastCentral = pairingEndpoint;
        }
      }
    } catch {
      // Invalid or stale announcements are deliberately ignored.
    }
  }

  async function start() {
    if (started) return;
    if (startPromise) return startPromise;
    stopped = false;
    const startGeneration = ++lifecycleGeneration;
    startPromise = Promise.resolve()
      .then(() => getConfiguration())
      .then((loadedConfiguration) => {
        if (stopped || startGeneration !== lifecycleGeneration) return undefined;
        return new Promise((resolve, reject) => {
        configuration = loadedConfiguration;
        socket = createSocket();
        const startupError = (error) => {
          socket?.removeListener?.('listening', listening);
          reject(error);
        };
        const listening = () => {
          socket?.removeListener?.('error', startupError);
          if (stopped || startGeneration !== lifecycleGeneration) {
            if (!socket?.close) resolve();
            else try { socket.close(resolve); } catch { resolve(); }
            return;
          }
          socket?.on?.('error', () => {});
          socket.setBroadcast(true);
          started = true;
          if (String(configuration.rol_nodo || '').toLowerCase() === 'central') {
            announce();
            announcementTimer = setIntervalFn(announce, announceIntervalMs);
            announcementTimer?.unref?.();
          }
          resolve();
        };
        socket.once('error', startupError);
        socket.once('listening', listening);
        socket.on('message', handleMessage);
        socket.bind(udpPort);
        });
      })
      .catch((error) => {
        startPromise = undefined;
        throw error;
      });
    return startPromise;
  }

  function discover({ linkCode } = {}) {
    if (!started) return start().then(() => discover({ linkCode }));
    if (lastCentral) return Promise.resolve({ ...lastCentral });
    if (String(configuration?.rol_nodo || '').toLowerCase() !== 'sucursal') {
      return Promise.reject(new Error('Solo una sucursal puede buscar una central.'));
    }
    const isPinned = Boolean(configuration.central_fingerprint && configuration.central_public_key);
    if (!isPinned && (typeof linkCode !== 'string' || !linkCode.trim())) {
      return Promise.reject(new Error('Se requiere un código de vínculo para buscar la central inicial.'));
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, linkCode, timer: undefined };
      waiter.timer = setTimeoutFn(() => {
        waiters.delete(waiter);
        reject(new Error('No se encontró una central en la red local dentro del tiempo esperado.'));
      }, discoveryTimeoutMs);
      waiters.add(waiter);
      const probe = { version: 1, type: 'clientes-central-discovery' };
      for (const broadcast of broadcasts()) send(probe, broadcast);
    });
  }

  async function stop() {
    stopped = true;
    lifecycleGeneration += 1;
    started = false;
    startPromise = undefined;
    lastCentral = null;
    candidates.clear();
    if (announcementTimer) clearIntervalFn(announcementTimer);
    announcementTimer = undefined;
    for (const waiter of waiters) {
      clearTimeoutFn(waiter.timer);
      waiter.reject(new Error('El descubrimiento LAN fue detenido.'));
    }
    waiters.clear();
    const activeSocket = socket;
    socket = undefined;
    if (activeSocket) {
      await new Promise((resolve) => {
        try {
          activeSocket.close(resolve);
        } catch {
          resolve();
        }
      });
    }
  }

  return {
    discover,
    getLastCentral: () => lastCentral && { ...lastCentral },
    listCandidates: () => {
      removeExpiredCandidates();
      return [...candidates.values()].map((candidate) => ({ ...candidate }));
    },
    start,
    stop,
  };
}

module.exports = {
  createClientDiscoveryService,
  directedBroadcasts,
  isAddressOnLocalSubnet,
};
