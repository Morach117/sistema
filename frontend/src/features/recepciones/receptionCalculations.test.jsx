import { describe, expect, it } from 'vitest'

import {
  calculatePresentation,
  priceComparison,
  validateReceptionItems,
} from './receptionCalculations.js'

describe('reception calculations', () => {
  it('keeps missing SICAR and blank physical count as non-blocking review', () => {
    const issues = validateReceptionItems([{ id: 1, cantidad: 10, costo_unitario: 5, existencia_lapiz: 0 }])

    expect(issues.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: 'missing-sicar', severity: 'review' },
      { code: 'missing-physical-count', severity: 'review' },
    ])
  })

  it('returns purchase, 20%, 30%, sale and real profit without changing sale', () => {
    expect(priceComparison({ precio_venta: 24 }, 19.49)).toEqual({
      compra: 19.49,
      sugerido20: 23.39,
      sugerido30: 25.34,
      ventaActual: 24,
      gananciaActual: 4.51,
      margenActual: 23.1,
    })
  })

  it('keeps invoice box math as quantity divided by pieces per box', () => {
    expect(calculatePresentation({ cantidad: 10, esPaquete: true, piezasPorPaquete: 4 })).toMatchObject({
      cantidadFacturada: 10,
      cantidadPresentacion: 2.5,
      piezasPorPaquete: 4,
      unidad: 'cajas',
    })
  })

  it('keeps invalid package configuration and zero cost as blocking errors', () => {
    const issues = validateReceptionItems([
      { id: 1, cantidad: 10, es_paquete: true, piezas_por_paquete: 0, costo_unitario: 0, clave_sicar: 'A' },
    ])

    expect(issues.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: 'zero-cost', severity: 'error' },
      { code: 'missing-physical-count', severity: 'review' },
      { code: 'invalid-package-config', severity: 'error' },
    ])
  })
})
