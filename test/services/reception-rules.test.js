const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildReceptionSummary,
  calculateCost,
  calculatePresentation,
  providerFrom,
  resolveDiscount,
  validateReceptionItems
} = require('../../services/reception-rules');

test('providerFrom identifies Tony by RFC and the known providers by name', () => {
  assert.equal(providerFrom({ $: { Rfc: 'TTI961202IM1', Nombre: 'Distribuidora cualquiera' } }), 'TONY');
  assert.equal(providerFrom({ $: { Rfc: 'XAXX010101000', Nombre: 'Paola Papeleria' } }), 'PAOLA');
  assert.equal(providerFrom({ $: { Rfc: 'XAXX010101000', Nombre: 'Operadora de Papelerias' } }), 'PAOLA');
  assert.equal(providerFrom({ $: { Rfc: 'OTV801119HU2', Nombre: 'Optivosa' } }), 'OPTIVOSA');
  assert.equal(providerFrom({ $: { Rfc: 'XAXX010101000', Nombre: 'Megamer mayoreo' } }), 'MEGAMER');
  assert.equal(providerFrom({ $: { Rfc: 'XAXX010101000', Nombre: 'Proveedor libre' } }), 'MANUAL');
});

test('resolveDiscount applies Tony XML discounts, Paola global discounts, and manual precedence', () => {
  assert.deepEqual(
    resolveDiscount({ proveedor: 'TONY', aplica_descuento: 1, aplica_descuento_manual: null }),
    { aplica: true, porcentaje: 0.05, origen: 'xml' }
  );
  assert.deepEqual(
    resolveDiscount({ proveedor: 'PAOLA', aplica_descuento: 0, aplica_descuento_manual: null }),
    { aplica: true, porcentaje: 0.05, origen: 'proveedor' }
  );
  assert.deepEqual(
    resolveDiscount({ proveedor: 'PAOLA', aplica_descuento: 1, aplica_descuento_manual: 0 }),
    { aplica: false, porcentaje: 0, origen: 'manual' }
  );
  assert.deepEqual(
    resolveDiscount({ proveedor: 'MANUAL', aplica_descuento: 0, aplica_descuento_manual: 1 }),
    { aplica: true, porcentaje: 0.05, origen: 'manual' }
  );
});

test('calculatePresentation converts sealed package quantities into exact cajas', () => {
  assert.deepEqual(
    calculatePresentation({ cantidad: 100, esPaquete: true, piezasPorPaquete: 10 }),
    {
      cantidadFacturada: 100,
      unidades: 100,
      esPaquete: true,
      piezasPorPaquete: 10,
      cantidadPresentacion: 10,
      presentacion: 'CAJAS'
    }
  );
});

test('calculatePresentation rejects invalid package configuration', () => {
  assert.throws(
    () => calculatePresentation({ cantidad: 12, esPaquete: true, piezasPorPaquete: 0 }),
    /caja|paquete/i
  );
});

test('calculateCost keeps XML IVA-included cost from being taxed twice', () => {
  assert.deepEqual(
    calculateCost({
      costoUnitario: 116,
      proveedor: 'TONY',
      aplicaIva: 1,
      aplicaDescuento: 1,
      aplicaDescuentoManual: null,
      source: { tipo: 'xml', costoIncluyeIva: true, ivaDetectado: 0.16 }
    }),
    {
      costoBase: 116,
      costoConIva: 116,
      costoFinal: 110.2,
      costoPorPieza: 110.2,
      iva: { detectado: true, porcentaje: 0.16, aplicado: false, yaIncluido: true },
      descuento: { aplica: true, porcentaje: 0.05, origen: 'xml' }
    }
  );
});

test('calculateCost trusts the persisted costoIncluyeIva flag after reload', () => {
  assert.deepEqual(
    calculateCost({
      costoUnitario: 29,
      proveedor: 'TONY',
      aplica_iva: 0,
      iva_tasa: 0.16,
      costoIncluyeIva: 1,
      aplica_descuento: 0
    }),
    {
      costoBase: 29,
      costoConIva: 29,
      costoFinal: 29,
      costoPorPieza: 29,
      iva: { detectado: true, porcentaje: 0.16, aplicado: false, yaIncluido: true },
      descuento: { aplica: false, porcentaje: 0, origen: 'xml' }
    }
  );
});

test('calculateCost preserves the safe historical path for known 256e140 Tony XML rows', () => {
  assert.deepEqual(
    calculateCost({
      costoUnitario: 29,
      proveedor: 'TONY',
      aplica_iva: 1,
      aplica_descuento: 1
    }),
    {
      costoBase: 29,
      costoConIva: 29,
      costoFinal: 27.55,
      costoPorPieza: 27.55,
      iva: { detectado: true, porcentaje: 0.16, aplicado: false, yaIncluido: true },
      descuento: { aplica: true, porcentaje: 0.05, origen: 'xml' }
    }
  );
});

test('calculateCost still taxes legitimate legacy rows that lack the XML signature', () => {
  assert.deepEqual(
    calculateCost({
      costoUnitario: 29,
      proveedor: 'MANUAL',
      aplica_iva: 1,
      aplica_descuento: 0
    }),
    {
      costoBase: 29,
      costoConIva: 33.64,
      costoFinal: 33.64,
      costoPorPieza: 33.64,
      iva: { detectado: true, porcentaje: 0.16, aplicado: true, yaIncluido: false },
      descuento: { aplica: false, porcentaje: 0, origen: 'ninguno' }
    }
  );
});

test('validateReceptionItems and buildReceptionSummary surface blocking issues and totals', () => {
  const items = [
    {
      id: 1,
      clave_final: 'ABC123',
      cantidad: 100,
      costo_unitario: 58,
      proveedor: 'PAOLA',
      aplica_iva: 0,
      aplica_descuento: 0,
      aplica_descuento_manual: null,
      es_paquete: 1,
      piezas_por_paquete: 10,
      revision_pendiente: 0
    },
    {
      id: 2,
      clave_final: '',
      cantidad: 4,
      costo_unitario: 0,
      proveedor: 'MANUAL',
      aplica_iva: 0,
      aplica_descuento: 0,
      aplica_descuento_manual: null,
      es_paquete: 1,
      piezas_por_paquete: 0,
      revision_pendiente: 2
    }
  ];

  assert.deepEqual(validateReceptionItems(items), [
    { itemId: 2, code: 'missing-sicar', severity: 'error' },
    { itemId: 2, code: 'zero-cost', severity: 'error' },
    { itemId: 2, code: 'review-pending', severity: 'warning' },
    { itemId: 2, code: 'invalid-package-config', severity: 'error' }
  ]);
  assert.deepEqual(buildReceptionSummary(items), {
    productos: 2,
    cajas: 10,
    piezas: 4,
    costoTotal: 55.1,
    articulosRevision: 1,
    errores: 3
  });
});
