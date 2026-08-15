const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { request } = require('../helpers/app');

const jwtSecret = 'evolucion-compatibility-test-secret-32';
process.env.JWT_SECRET = jwtSecret;

function loadRouterWithDatabase(database) {
  const databasePath = require.resolve('../../config/database');
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: database
  };
  const routePath = require.resolve('../../routes/evolucion');
  delete require.cache[routePath];
  return require('../../routes/evolucion');
}

function authToken() {
  return jwt.sign({ id: 1, rol: 'admin', permisos: ['evolucion-precios'] }, jwtSecret);
}

test('serves known 256e140 Tony XML rows through the safe historical VAT path', async () => {
  const app = express();
  app.use('/api/evolucion-precios', loadRouterWithDatabase({
    async execute() {
      return [[{
        id: 7,
        codigo_proveedor: 'SKU-7',
        descripcion_original: 'Producto XML',
        cantidad: 1,
        costo_unitario: 29,
        es_paquete: 0,
        piezas_por_paquete: 1,
        aplica_iva: 1,
        iva_tasa: null,
        costo_incluye_iva: 0,
        aplica_descuento: 1,
        aplica_descuento_manual: null,
        sicar: 'SKU-7',
        desc_final: 'Producto XML',
        proveedor: 'TONY',
        fecha_carga: '2026-08-15 10:00:00',
        numero_remision: 'A12'
      }], []];
    }
  }));

  const response = await request(app)
    .get('/api/evolucion-precios?buscar_codigo=SKU-7')
    .set('Authorization', `Bearer ${authToken()}`);

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.data[0], {
    id: 7,
    codigo_proveedor: 'SKU-7',
    descripcion_original: 'Producto XML',
    cantidad: 1,
    costo_unitario: 29,
    es_paquete: 0,
    piezas_por_paquete: 1,
    aplica_iva: 0,
    iva_tasa: 0.16,
    costo_incluye_iva: 1,
    aplica_descuento: 1,
    aplica_descuento_manual: null,
    sicar: 'SKU-7',
    desc_final: 'Producto XML',
    proveedor: 'TONY',
    fecha_carga: '2026-08-15 10:00:00',
    numero_remision: 'A12'
  });
});

test('leaves legitimate legacy taxable rows unchanged when no safe XML signature exists', async () => {
  const app = express();
  app.use('/api/evolucion-precios', loadRouterWithDatabase({
    async execute() {
      return [[{
        id: 8,
        codigo_proveedor: 'SKU-8',
        descripcion_original: 'Compra manual',
        cantidad: 1,
        costo_unitario: 29,
        es_paquete: 0,
        piezas_por_paquete: 1,
        aplica_iva: 1,
        iva_tasa: null,
        costo_incluye_iva: 0,
        aplica_descuento: 0,
        aplica_descuento_manual: null,
        sicar: 'SKU-8',
        desc_final: 'Compra manual',
        proveedor: 'MANUAL',
        fecha_carga: '2026-08-14 10:00:00',
        numero_remision: 'MAN8'
      }], []];
    }
  }));

  const response = await request(app)
    .get('/api/evolucion-precios?buscar_codigo=SKU-8')
    .set('Authorization', `Bearer ${authToken()}`);

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.data[0], {
    id: 8,
    codigo_proveedor: 'SKU-8',
    descripcion_original: 'Compra manual',
    cantidad: 1,
    costo_unitario: 29,
    es_paquete: 0,
    piezas_por_paquete: 1,
    aplica_iva: 1,
    iva_tasa: null,
    costo_incluye_iva: 0,
    aplica_descuento: 0,
    aplica_descuento_manual: null,
    sicar: 'SKU-8',
    desc_final: 'Compra manual',
    proveedor: 'MANUAL',
    fecha_carga: '2026-08-14 10:00:00',
    numero_remision: 'MAN8'
  });
});
