import * as XLSX from 'xlsx'

const HEADERS = ['CLAVE SICAR', 'DESCRIPCIÓN', 'CANTIDAD']

function formatQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null
}

export function buildTransferSheetRows(details, direction) {
  const multiplier = direction === 'salida' ? -1 : 1

  return details
    .map((detail) => {
      const code = String(detail.clave_sicar ?? detail.codigo ?? detail.id ?? '').trim()
      const quantity = formatQuantity(detail.cantidad ?? detail.cantidad_recibida)
      if (!code || quantity === null) return null

      return {
        'CLAVE SICAR': code,
        'DESCRIPCIÓN': detail.descripcion ?? '',
        'CANTIDAD': quantity * multiplier,
      }
    })
    .filter(Boolean)
}

export function buildTransferWorkbook(details) {
  const workbook = XLSX.utils.book_new()
  const salida = XLSX.utils.json_to_sheet(buildTransferSheetRows(details, 'salida'), { header: HEADERS })
  const entrada = XLSX.utils.json_to_sheet(buildTransferSheetRows(details, 'entrada'), { header: HEADERS })

  salida['!cols'] = [{ wch: 18 }, { wch: 48 }, { wch: 14 }]
  entrada['!cols'] = [{ wch: 18 }, { wch: 48 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(workbook, salida, 'Salida')
  XLSX.utils.book_append_sheet(workbook, entrada, 'Entrada')
  return workbook
}

export function downloadTransferWorkbook({ transferId, details }) {
  const date = new Date().toISOString().slice(0, 10)
  const workbook = buildTransferWorkbook(details)
  XLSX.writeFile(workbook, `Traspaso_${transferId}_${date}.xlsx`)
  return true
}
