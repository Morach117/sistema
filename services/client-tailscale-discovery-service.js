const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const { verifyCentralFingerprint } = require('./client-identity-service');
const { verifySignedEnvelope } = require('./client-sync-service');

const execFileAsync = promisify(execFile);
const DEFAULT_API_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_PEERS = 64;

function isTailscaleAddress(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

function safePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('El puerto de la Central no es válido.');
  return port;
}

function tailscalePeers(status) {
  const entries = Array.isArray(status?.Peer) ? status.Peer : Object.values(status?.Peer || {});
  const peers = [];
  for (const entry of entries) {
    if (!entry || entry.Online === false) continue;
    const address = (entry.TailscaleIPs || []).find(isTailscaleAddress);
    if (!address || peers.some((peer) => peer.address === address)) continue;
    peers.push({ address, name: String(entry.DNSName || entry.HostName || '').replace(/\.$/, '') });
    if (peers.length >= MAX_PEERS) break;
  }
  return peers;
}

async function defaultListPeers() {
  const windowsBinary = 'C:\\Program Files\\Tailscale\\tailscale.exe';
  const command = process.env.TAILSCALE_BIN || (process.platform === 'win32' && fs.existsSync(windowsBinary) ? windowsBinary : 'tailscale');
  const { stdout } = await execFileAsync(command, ['status', '--json'], {
    windowsHide: true,
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: 512 * 1024,
  });
  return tailscalePeers(JSON.parse(stdout));
}

function createTailscaleDiscoveryService({
  getConfiguration = async () => {
    const [rows] = await require('../config/database').execute(
      `SELECT configuracion.rol_nodo, configuracion.central_fingerprint, configuracion.central_public_key
         FROM cliente_configuracion AS configuracion
        WHERE configuracion.alcance_local = 1
        LIMIT 1`
    );
    if (rows.length !== 1) throw new Error('No hay identidad configurada.');
    return rows[0];
  },
  listPeers = defaultListPeers,
  fetchFn = globalThis.fetch,
  apiPort = Number(process.env.PORT || DEFAULT_API_PORT),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const defaultPort = safePort(apiPort);
  if (typeof listPeers !== 'function' || typeof fetchFn !== 'function') throw new TypeError('Se requieren servicios de red válidos.');
  let lastCentral = null;
  const candidates = new Map();

  function remember({ name, fingerprint }) {
    candidates.set(fingerprint, { name, fingerprint, network: 'privada', seenAt: now() });
  }

  async function inspectPeer(peer, configuration) {
    if (!isTailscaleAddress(peer?.address)) return null;
    const response = await fetchFn(`http://${peer.address}:${defaultPort}/api/clientes-sync/anuncio`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const envelope = await response.json();
    const payload = envelope?.payload;
    if (!verifyCentralFingerprint({ publicKey: payload?.centralPublicKey, fingerprint: payload?.centralFingerprint })) return null;
    const verified = verifySignedEnvelope({
      envelope,
      publicKey: payload.centralPublicKey,
      expectedType: 'clientes-central-announcement',
      now: now(),
    });
    const port = safePort(verified.apiPort);
    if (
      configuration.central_fingerprint &&
      (verified.centralFingerprint !== configuration.central_fingerprint || verified.centralPublicKey !== configuration.central_public_key)
    ) return null;
    const name = String(verified.centralName || '').trim();
    if (!name || name.length > 120) return null;
    remember({ name, fingerprint: verified.centralFingerprint });
    return {
      address: peer.address,
      port,
      network: 'tailscale',
      centralFingerprint: verified.centralFingerprint,
      centralPublicKey: verified.centralPublicKey,
    };
  }

  async function scan() {
    const configuration = await getConfiguration();
    if (String(configuration.rol_nodo || '').toLowerCase() !== 'sucursal') return [];
    const peers = await listPeers();
    const results = await Promise.allSettled(peers.map((peer) => inspectPeer(peer, configuration)));
    return results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  }

  return {
    async discover({ expectedCentralFingerprint } = {}) {
      const endpoints = await scan();
      const selected = endpoints.find((endpoint) => !expectedCentralFingerprint || endpoint.centralFingerprint === expectedCentralFingerprint);
      if (!selected) throw new Error('No se encontró una Central en la red privada de sucursales.');
      lastCentral = selected;
      return { ...selected };
    },
    async refresh() {
      await scan();
      return this.listCandidates();
    },
    getLastCentral: () => lastCentral && { ...lastCentral },
    listPeers: async () => (await listPeers()).filter((peer) => isTailscaleAddress(peer?.address)),
    listCandidates: () => [...candidates.values()].sort((a, b) => b.seenAt - a.seenAt).map((candidate) => ({ ...candidate })),
    async start() {},
    async stop() { lastCentral = null; candidates.clear(); },
  };
}

module.exports = { createTailscaleDiscoveryService, isTailscaleAddress, tailscalePeers };
