function normalizeProvider(value) {
  if (value && typeof value === 'object') {
    return normalizeProvider(value.$?.Nombre || value.nombre || '');
  }
  return String(value || '').trim().toUpperCase();
}

function truthyFlag(value) {
  return value === true || value === 1 || value === '1';
}

function numeric(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((numeric(value) + Number.EPSILON) * factor) / factor;
}

function providerFrom(emisor) {
  const rfc = String(emisor?.$?.Rfc || emisor?.rfc || '').trim().toUpperCase();
  const nombre = normalizeProvider(emisor);

  if (rfc === 'TTI961202IM1' || nombre.includes('TONY')) return 'TONY';
  if (rfc === 'LOVM900722BD8' || nombre.includes('PAOLA') || nombre.includes('OPERADORA')) return 'PAOLA';
  if (rfc === 'OTV801119HU2' || nombre.includes('OPTIVOSA')) return 'OPTIVOSA';
  if (rfc === 'GME191105I5A' || nombre.includes('MEGAMER')) return 'MEGAMER';
  if (nombre.includes('SINDESC')) return 'SINDESC';
  return 'MANUAL';
}

function resolveDiscount({
  proveedor,
  aplica_descuento,
  aplicaDescuento,
  aplica_descuento_manual,
  aplicaDescuentoManual,
  discountRate = 0.05
} = {}) {
  const manual = aplicaDescuentoManual ?? aplica_descuento_manual;
  if (manual !== null && manual !== undefined && manual !== '') {
    return truthyFlag(manual)
      ? { aplica: true, porcentaje: discountRate, origen: 'manual' }
      : { aplica: false, porcentaje: 0, origen: 'manual' };
  }

  const normalizedProvider = providerFrom({ nombre: proveedor });
  if (normalizedProvider === 'PAOLA') {
    return { aplica: true, porcentaje: discountRate, origen: 'proveedor' };
  }
  if (normalizedProvider === 'TONY') {
    return truthyFlag(aplicaDescuento ?? aplica_descuento)
      ? { aplica: true, porcentaje: discountRate, origen: 'xml' }
      : { aplica: false, porcentaje: 0, origen: 'xml' };
  }
  if (normalizedProvider === 'SINDESC') {
    return { aplica: false, porcentaje: 0, origen: 'proveedor' };
  }
  return { aplica: false, porcentaje: 0, origen: 'ninguno' };
}

function calculatePresentation({ cantidad, esPaquete, piezasPorPaquete } = {}) {
  const unidades = numeric(cantidad);
  const usesPackage = truthyFlag(esPaquete);
  const pieces = numeric(piezasPorPaquete);

  if (usesPackage) {
    if (pieces <= 0) {
      throw new RangeError('La configuracion de caja o paquete no es valida.');
    }
    return {
      cantidadFacturada: unidades,
      unidades,
      esPaquete: true,
      piezasPorPaquete: pieces,
      cantidadPresentacion: round(unidades / pieces),
      presentacion: 'CAJAS'
    };
  }

  return {
    cantidadFacturada: unidades,
    unidades,
    esPaquete: false,
    piezasPorPaquete: pieces > 0 ? pieces : 1,
    cantidadPresentacion: unidades,
    presentacion: 'PIEZAS'
  };
}

function calculateCost({
  costoUnitario,
  proveedor,
  aplicaIva,
  aplica_iva,
  ivaTasa,
  iva_tasa,
  costoIncluyeIva,
  costo_incluye_iva,
  aplicaDescuento,
  aplica_descuento,
  aplicaDescuentoManual,
  aplica_descuento_manual,
  source,
  esPaquete,
  piezasPorPaquete
} = {}) {
  const costoBase = round(costoUnitario);
  const metadata = source || {};
  const explicitIvaRate = numeric(ivaTasa ?? iva_tasa ?? metadata.ivaDetectado);
  const alreadyIncludesVat = truthyFlag(costoIncluyeIva ?? costo_incluye_iva ?? metadata.costoIncluyeIva);
  const ivaRate = explicitIvaRate || ((alreadyIncludesVat || truthyFlag(aplicaIva ?? aplica_iva)) ? 0.16 : 0);
  const costoConIva = alreadyIncludesVat
    ? costoBase
    : round(costoBase * (ivaRate > 0 ? (1 + ivaRate) : 1));
  const descuento = resolveDiscount({
    proveedor,
    aplicaDescuento: aplicaDescuento ?? aplica_descuento,
    aplicaDescuentoManual: aplicaDescuentoManual ?? aplica_descuento_manual
  });
  const costoFinal = descuento.aplica
    ? round(costoConIva * (1 - descuento.porcentaje))
    : costoConIva;

  let costoPorPieza = costoFinal;
  try {
    const presentation = calculatePresentation({ cantidad: 1, esPaquete, piezasPorPaquete });
    if (presentation.esPaquete && presentation.piezasPorPaquete > 1) {
      costoPorPieza = round(costoFinal / presentation.piezasPorPaquete);
    }
  } catch {
    costoPorPieza = costoFinal;
  }

  return {
    costoBase,
    costoConIva,
    costoFinal,
    costoPorPieza,
    iva: {
      detectado: alreadyIncludesVat || ivaRate > 0,
      porcentaje: ivaRate,
      aplicado: ivaRate > 0 && !alreadyIncludesVat,
      yaIncluido: alreadyIncludesVat
    },
    descuento
  };
}

function validateReceptionItems(items) {
  const issues = [];

  for (const item of Array.isArray(items) ? items : []) {
    const itemId = item?.id ?? null;
    const clave = String(item?.clave_final || item?.clave_sicar || '').trim();
    if (!clave) {
      issues.push({ itemId, code: 'missing-sicar', severity: 'error' });
    }
    if (numeric(item?.costo_unitario) <= 0) {
      issues.push({ itemId, code: 'zero-cost', severity: 'error' });
    }
    if (truthyFlag(item?.revision_pendiente === 2 ? 1 : 0)) {
      issues.push({ itemId, code: 'review-pending', severity: 'warning' });
    }
    try {
      calculatePresentation({
        cantidad: item?.cantidad,
        esPaquete: item?.es_paquete,
        piezasPorPaquete: item?.piezas_por_paquete
      });
    } catch {
      issues.push({ itemId, code: 'invalid-package-config', severity: 'error' });
    }
  }

  return issues;
}

function buildReceptionSummary(items) {
  const rows = Array.isArray(items) ? items : [];
  const issues = validateReceptionItems(rows);
  const summary = {
    productos: rows.length,
    cajas: 0,
    piezas: 0,
    costoTotal: 0,
    articulosRevision: 0,
    errores: issues.filter((issue) => issue.severity === 'error').length
  };

  for (const item of rows) {
    if (Number(item?.revision_pendiente) === 2) {
      summary.articulosRevision += 1;
    }

    try {
      const presentation = calculatePresentation({
        cantidad: item?.cantidad,
        esPaquete: item?.es_paquete,
        piezasPorPaquete: item?.piezas_por_paquete
      });
      if (presentation.esPaquete) {
        summary.cajas += presentation.cantidadPresentacion;
      } else {
        summary.piezas += presentation.cantidadPresentacion;
      }
    } catch {
      summary.piezas += numeric(item?.cantidad);
    }

    summary.costoTotal += calculateCost({
      costoUnitario: item?.costo_unitario,
      proveedor: item?.proveedor,
      aplicaIva: item?.aplica_iva,
      aplicaDescuento: item?.aplica_descuento,
      aplicaDescuentoManual: item?.aplica_descuento_manual,
      source: item?.source,
      esPaquete: item?.es_paquete,
      piezasPorPaquete: item?.piezas_por_paquete
    }).costoFinal;
  }

  summary.cajas = round(summary.cajas);
  summary.piezas = round(summary.piezas);
  summary.costoTotal = round(summary.costoTotal, 2);
  return summary;
}

module.exports = {
  buildReceptionSummary,
  calculateCost,
  calculatePresentation,
  providerFrom,
  resolveDiscount,
  validateReceptionItems
};
