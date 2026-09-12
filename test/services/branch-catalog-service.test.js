const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { createBranchCatalogService } = require('../../services/branch-catalog-service');

const CENTRAL_ID = '11111111-1111-4111-8111-111111111111';

function centralStore() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return {
    async readConfiguration() {
      return {
        sucursal_id: CENTRAL_ID,
        sucursal_nombre: 'Matriz',
        rol_nodo: 'central',
        central_fingerprint: 'a'.repeat(64),
        central_private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      };
    },
    async findProduct(code) {
      if (code !== '7500000000001') return null;
      return {
        clave_sicar: '7500000000001',
        codigo_barras: '7500000000001',
        descripcion: 'Cuaderno',
        precio_venta: '24.50',
      };
    },
  };
}

test('consultas de recepción eliminan precios cuando no están autorizados', async () => {
  const service = createBranchCatalogService({ store: centralStore() });

  const result = await service.resolveForReception({ code: '7500000000001', includePrices: false });

  assert.deepEqual(result, {
    entries: [{
      sucursalId: CENTRAL_ID,
      sucursal: 'Matriz',
      claveSicar: '7500000000001',
      codigoBarras: '7500000000001',
      descripcion: 'Cuaderno',
    }],
  });
});

test('consultas administrativas incluyen el precio de venta de la sucursal', async () => {
  const service = createBranchCatalogService({ store: centralStore() });

  const result = await service.resolveForReception({ code: '7500000000001', includePrices: true });

  assert.equal(result.entries[0].precioVenta, 24.5);
});
