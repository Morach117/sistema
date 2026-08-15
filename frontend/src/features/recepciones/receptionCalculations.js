const numeric = (value) => {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : 0
}

const enabled = (value) => value === true || value === 1 || value === '1'

const round = (value, decimals = 4) => {
  const factor = 10 ** decimals
  return Math.round((numeric(value) + Number.EPSILON) * factor) / factor
}

export function providerKind(value) {
  const provider = String(value || '').trim().toUpperCase()
  if (provider.includes('PAOLA') || provider.includes('OPERADORA')) return 'PAOLA'
  if (provider.includes('TONY')) return 'TONY'
  if (provider.includes('OPTIVOSA')) return 'OPTIVOSA'
  if (provider.includes('SINDESC')) return 'SINDESC'
  return 'MANUAL'
}

export function calculatePresentation({ cantidad, esPaquete, piezasPorPaquete } = {}) {
  const pieces = numeric(cantidad)
  if (!enabled(esPaquete)) {
    return {
      cantidadFacturada: pieces,
      cantidadPresentacion: pieces,
      esPaquete: false,
      piezasPorPaquete: 1,
      unidad: 'piezas',
    }
  }

  const piecesPerBox = numeric(piezasPorPaquete)
  if (piecesPerBox <= 0) throw new RangeError('La configuración de caja no es válida.')
  return {
    cantidadFacturada: pieces,
    cantidadPresentacion: round(pieces / piecesPerBox),
    esPaquete: true,
    piezasPorPaquete: piecesPerBox,
    unidad: 'cajas',
  }
}

export function resolveDiscount({ proveedor, aplicaDescuento, aplicaDescuentoManual, porcentaje = 5 } = {}) {
  if (aplicaDescuentoManual !== null && aplicaDescuentoManual !== undefined && aplicaDescuentoManual !== '') {
    return {
      aplica: enabled(aplicaDescuentoManual),
      porcentaje: enabled(aplicaDescuentoManual) ? numeric(porcentaje) : 0,
      origen: 'manual',
    }
  }

  const provider = providerKind(proveedor)
  if (provider === 'PAOLA') return { aplica: true, porcentaje: numeric(porcentaje), origen: 'proveedor' }
  if (provider === 'TONY') {
    return {
      aplica: enabled(aplicaDescuento),
      porcentaje: enabled(aplicaDescuento) ? numeric(porcentaje) : 0,
      origen: 'xml',
    }
  }
  return { aplica: false, porcentaje: 0, origen: provider === 'SINDESC' ? 'proveedor' : 'ninguno' }
}

export function calculateCost(item, { proveedor, porcentaje = 5 } = {}) {
  const cost = numeric(item?.costo_unitario ?? item?.costo_bruto ?? item?.costo)
  const vatRate = numeric(item?.iva_tasa) || (enabled(item?.aplica_iva) ? 0.16 : 0)
  const costWithVat = enabled(item?.costo_incluye_iva) ? cost : round(cost * (1 + vatRate))
  const discount = resolveDiscount({
    proveedor: item?.proveedor || proveedor,
    aplicaDescuento: item?.aplica_descuento,
    aplicaDescuentoManual: item?.aplica_descuento_manual,
    porcentaje,
  })
  const finalCost = discount.aplica
    ? round(costWithVat * (1 - discount.porcentaje / 100))
    : costWithVat

  return { costoBase: cost, costoConIva: costWithVat, costoFinal: finalCost, descuento: discount }
}

export function validateReceptionItems(items) {
  const issues = []
  for (const item of Array.isArray(items) ? items : []) {
    const itemId = item?.id ?? null
    const description = item?.desc || item?.descripcion_original || `Artículo ${itemId || ''}`.trim()
    if (!String(item?.clave_final || item?.clave_sicar || '').trim()) {
      issues.push({ itemId, description, code: 'missing-sicar', message: `${description}: falta clave SICAR.`, severity: 'error' })
    }
    if (numeric(item?.costo_unitario ?? item?.costo) <= 0) {
      issues.push({ itemId, description, code: 'zero-cost', message: `${description}: el costo debe ser mayor que cero.`, severity: 'error' })
    }
    const receptionKey = String(
      item?.clave_final || item?.clave_sicar || item?.clave_memoria || item?.clave_catalogo || '',
    ).trim().toUpperCase()
    const skipsPhysicalCount = receptionKey === 'FALTANTE' || receptionKey === 'DEVOLUCION'
    if (!skipsPhysicalCount && numeric(item?.existencia_lapiz) <= 0) {
      issues.push({ itemId, description, code: 'missing-physical-count', message: `${description}: el conteo físico debe ser mayor que cero.`, severity: 'error' })
    }
    if (Number(item?.revision_pendiente) === 2) {
      issues.push({ itemId, description, code: 'rejected-item', message: `${description}: artículo rechazado; restáuralo o corrige la decisión.`, severity: 'error' })
    }
    try {
      calculatePresentation({
        cantidad: item?.cantidad ?? item?.cant,
        esPaquete: item?.es_paquete,
        piezasPorPaquete: item?.piezas_por_paquete,
      })
    } catch {
      issues.push({ itemId, description, code: 'invalid-package-config', message: `${description}: la configuración de caja no es válida.`, severity: 'error' })
    }
  }
  return issues
}

export function buildReceptionSummary(items, { proveedor, porcentaje = 5 } = {}) {
  const summary = { productos: 0, cajas: 0, piezas: 0, costoTotal: 0, articulosRevision: 0, errores: 0 }
  const rows = Array.isArray(items) ? items : []
  summary.productos = rows.length
  summary.errores = validateReceptionItems(rows).filter((issue) => issue.severity === 'error').length

  for (const item of rows) {
    if (Number(item?.revision_pendiente) === 2) summary.articulosRevision += 1
    try {
      const presentation = calculatePresentation({
        cantidad: item?.cantidad ?? item?.cant,
        esPaquete: item?.es_paquete,
        piezasPorPaquete: item?.piezas_por_paquete,
      })
      if (presentation.esPaquete) summary.cajas += presentation.cantidadPresentacion
      else summary.piezas += presentation.cantidadPresentacion
    } catch {
      summary.piezas += numeric(item?.cantidad ?? item?.cant)
    }
    summary.costoTotal += calculateCost(item, { proveedor, porcentaje }).costoFinal
  }

  summary.cajas = round(summary.cajas)
  summary.piezas = round(summary.piezas)
  summary.costoTotal = round(summary.costoTotal, 2)
  return summary
}

export function displayNumber(value) {
  return numeric(value).toLocaleString('es-MX', { maximumFractionDigits: 4 })
}

export function invoicePhysicalDifference(item) {
  const presentation = calculatePresentation({
    cantidad: item?.cantidad ?? item?.cant,
    esPaquete: item?.es_paquete,
    piezasPorPaquete: item?.piezas_por_paquete,
  })
  const physical = numeric(item?.existencia_lapiz)
  return { ...presentation, fisico: physical, diferencia: round(physical - presentation.cantidadPresentacion) }
}
