import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildTransferSheetRows, buildTransferWorkbook } from './sicarExport'

const details = [
  { codigo: '000123', descripcion: 'Cuaderno profesional', cantidad: 5 },
  { clave_sicar: 'SKU-2', descripcion: 'Pluma azul', cantidad_recibida: 2.5 },
  { codigo: 'IGNORAR', cantidad: 0 },
]

describe('exportación de traspasos', () => {
  it('prepara salida y entrada con las cantidades en el signo correcto', () => {
    expect(buildTransferSheetRows(details, 'salida')).toEqual([
      { 'CLAVE SICAR': '000123', 'CANTIDAD': -5 },
      { 'CLAVE SICAR': 'SKU-2', 'CANTIDAD': -2.5 },
    ])
    expect(buildTransferSheetRows(details, 'entrada')).toEqual([
      { 'CLAVE SICAR': '000123', 'CANTIDAD': 5 },
      { 'CLAVE SICAR': 'SKU-2', 'CANTIDAD': 2.5 },
    ])
  })

  it('crea un solo libro con las hojas Salida y Entrada', () => {
    const workbook = buildTransferWorkbook(details)

    expect(workbook.SheetNames).toEqual(['Salida', 'Entrada'])
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Salida)).toEqual(buildTransferSheetRows(details, 'salida'))
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Entrada)).toEqual(buildTransferSheetRows(details, 'entrada'))
  })
})
