import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import Swal from 'sweetalert2'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, saveSession } from '@/auth/session'
import api from '@/lib/api'
import Recepciones from './Recepciones'

const originalAdapter = api.defaults.adapter

function responseFor(config, data = {}, headers = {}) {
  return { data, status: 200, statusText: 'OK', headers, config, request: {} }
}

function user(permisos = ['recepciones']) {
  return { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos }
}

function item(overrides = {}) {
  return {
    id: 11,
    cod_prov: 'PROV-11',
    desc: 'Cuaderno caja',
    cant: 100,
    costo: 100,
    costo_bruto: 100,
    costo_unitario: 100,
    costo_incluye_iva: 1,
    aplica_iva: 1,
    iva_tasa: 0.16,
    aplica_descuento: 0,
    aplica_descuento_manual: null,
    clave_final: 'SICAR-11',
    clave_sicar: 'SICAR-11',
    es_paquete: 1,
    piezas_por_paquete: 10,
    existencia_lapiz: 8,
    revision_pendiente: 0,
    ...overrides,
  }
}

function createAdapter({ detailsItems = [item()], requests = [], preview, uploadResponse, failFieldSave = false } = {}) {
  return async (config) => {
    requests.push(config)
    if (config.url === '/api/recepciones' && config.method === 'get') {
      return responseFor(config, {
        data: [{ id: 7, numero_remision: 'REM-7', proveedor: 'PAOLA', estado: 'PENDIENTE', fecha_carga: '2026-08-15', items: detailsItems.length }],
      })
    }
    if (config.url === '/api/recepciones/7' && config.method === 'get') {
      return responseFor(config, {
        success: true,
        proveedor: 'PAOLA',
        estado: 'PENDIENTE',
        datos: { 'REM-7': detailsItems },
      })
    }
    if (config.url === '/api/recepciones/preview-upload') {
      return responseFor(config, preview || {
        success: true,
        puedeGuardar: true,
        preview: [{
          folio: 'REM-NUEVA',
          proveedor: 'TONY',
          clasificacion: 'nuevo',
          estadoActual: null,
          puedeGuardar: true,
          resumen: { productos: 1, cajas: 0, piezas: 4, costoTotal: 110.2, articulosRevision: 0, errores: 0 },
          issues: [],
          items: [],
        }],
      })
    }
    if (config.url === '/api/recepciones/upload') {
      return responseFor(config, uploadResponse || { success: true, mensaje: 'Archivos procesados' })
    }
    if (config.url === '/api/recepciones/actualizar_campo' && failFieldSave) {
      const error = new Error('No se pudo guardar')
      error.response = { data: { error: 'No se pudo guardar' } }
      throw error
    }
    if (config.url === '/api/recepciones/generar_excel') {
      return responseFor(config, new Blob(['excel']), { 'content-disposition': 'attachment; filename="Carga.xls"' })
    }
    if (config.url === '/api/evolucion-precios') {
      return responseFor(config, {
        success: true,
        data: [{ id: 50, numero_remision: 'ANT-1', fecha_carga: '2026-07-10 10:00:00', proveedor: 'TONY', costo_unitario: 88 }],
      })
    }
    return responseFor(config, { success: true })
  }
}

function renderPage(adapter, permissions = ['recepciones']) {
  saveSession({ token: 'signed-token', user: user(permissions) })
  api.defaults.adapter = adapter
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><Recepciones /></MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openReception() {
  fireEvent.click(await screen.findByRole('button', { name: /REM-7/i }))
  return screen.findByRole('heading', { name: /Orden #REM-7/i })
}

beforeEach(() => {
  vi.spyOn(Swal, 'fire').mockResolvedValue({ isConfirmed: true })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  clearSession()
  api.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
})

describe('Recepciones presentation and cost review', () => {
  it('shows exact box math, invoice/physical difference, automatic discount and a manual exception', async () => {
    const detailsItems = [
      item(),
      item({
        id: 12,
        cod_prov: 'PROV-12',
        desc: 'Pluma individual',
        cant: 5,
        costo: 50,
        costo_bruto: 50,
        costo_unitario: 50,
        clave_final: 'SICAR-12',
        clave_sicar: 'SICAR-12',
        es_paquete: 0,
        piezas_por_paquete: 1,
        existencia_lapiz: 7,
        aplica_descuento: 1,
        aplica_descuento_manual: 0,
      }),
    ]
    renderPage(createAdapter({ detailsItems }))
    await openReception()

    expect(screen.getByText('100 piezas ÷ 10 = 10 cajas')).toBeVisible()
    expect(screen.getByText('Factura 10 cajas · Físico 8 · Diferencia -2 cajas')).toBeVisible()
    expect(screen.getByText('Descuento automático: proveedor')).toBeVisible()
    expect(screen.getByText('Costo neto $95.00')).toBeVisible()
    expect(screen.getByText('Factura 5 piezas · Físico 7 · Diferencia +2 piezas')).toBeVisible()
    expect(screen.getByText('Excepción manual: sin descuento')).toBeVisible()
    expect(screen.getByText('Costo neto $50.00')).toBeVisible()

    const summary = screen.getByRole('region', { name: /resumen de recepción/i })
    expect(within(summary).getByText('2')).toBeVisible()
    expect(within(summary).getByText('10')).toBeVisible()
    expect(within(summary).getByText('5')).toBeVisible()
    expect(within(summary).getByText('$145.00')).toBeVisible()
    expect(screen.getByText(/paola aplica 5% a todos los artículos/i)).toBeVisible()
    expect(screen.queryByRole('spinbutton', { name: /dto/i })).not.toBeInTheDocument()
  })

  it('persists null when a manual discount exception returns to automatic', async () => {
    const requests = []
    renderPage(createAdapter({
      detailsItems: [item({ aplica_descuento_manual: 0 })],
      requests,
    }))
    await openReception()

    fireEvent.change(screen.getByLabelText(/descuento Cuaderno caja/i), { target: { value: 'automatico' } })

    await waitFor(() => {
      const request = requests.find((entry) => entry.url === '/api/recepciones/actualizar_campo')
      expect(JSON.parse(request.data)).toEqual({
        id_item: 11,
        campo: 'aplica_descuento_manual',
        valor: null,
      })
    })
  })

  it('applies box and discount configuration to every selected item', async () => {
    const requests = []
    const detailsItems = [item(), item({ id: 12, cod_prov: 'P-12', desc: 'Pluma individual', cant: 20, es_paquete: 0, piezas_por_paquete: 1 })]
    renderPage(createAdapter({ detailsItems, requests }))
    await openReception()

    fireEvent.click(screen.getByRole('checkbox', { name: /seleccionar todo/i }))
    fireEvent.change(screen.getByLabelText(/presentación masiva/i), { target: { value: 'caja' } })
    fireEvent.change(screen.getByLabelText(/piezas por caja masiva/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/descuento masivo/i), { target: { value: 'aplicar' } })
    fireEvent.click(screen.getByRole('button', { name: /aplicar a 2 artículos/i }))

    await waitFor(() => {
      const writes = requests.filter((request) => request.url === '/api/recepciones/actualizar_campo')
      expect(writes).toHaveLength(6)
      const payloads = writes.map((request) => JSON.parse(request.data))
      expect(payloads).toEqual(expect.arrayContaining([
        { id_item: 11, campo: 'es_paquete', valor: 1 },
        { id_item: 11, campo: 'piezas_por_paquete', valor: 5 },
        { id_item: 11, campo: 'aplica_descuento_manual', valor: 1 },
        { id_item: 12, campo: 'es_paquete', valor: 1 },
        { id_item: 12, campo: 'piezas_por_paquete', valor: 5 },
        { id_item: 12, campo: 'aplica_descuento_manual', valor: 1 },
      ]))
    })
  })

  it('lists blocking errors before finalization', async () => {
    renderPage(createAdapter({ detailsItems: [item({ clave_final: '', clave_sicar: '', costo: 0, costo_unitario: 0, piezas_por_paquete: 0 })] }))
    await openReception()

    const review = screen.getByRole('region', { name: /revisión antes de finalizar/i })
    expect(within(review).getByText(/falta clave SICAR/i)).toBeVisible()
    expect(within(review).getByText(/costo debe ser mayor que cero/i)).toBeVisible()
    expect(within(review).getByText(/configuración de caja no es válida/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /finalizar/i })).toBeDisabled()
  })

  it('explains the automatic discount rule for the selected supplier instead of showing a fixed discount', async () => {
    renderPage(createAdapter())
    await openReception()

    expect(screen.getByText(/paola aplica 5% a todos los artículos/i)).toBeVisible()
    fireEvent.change(screen.getByLabelText(/^prov$/i), { target: { value: 'custom' } })
    expect(screen.getByText(/no aplica con proveedor manual/i)).toBeVisible()
    fireEvent.change(screen.getByLabelText(/^prov$/i), { target: { value: 'paola' } })
    expect(screen.getByText(/paola aplica 5% a todos los artículos/i)).toBeVisible()
  })

  it('keeps a long validation list compact until the user expands it', async () => {
    renderPage(createAdapter({
      detailsItems: [
        item({ id: 11, clave_final: '', clave_sicar: '', costo: 0, costo_unitario: 0, piezas_por_paquete: 0 }),
        item({ id: 12, desc: 'Segundo artículo sin revisar', clave_final: '', clave_sicar: '', costo: 0, costo_unitario: 0, piezas_por_paquete: 0 }),
      ],
    }))
    await openReception()

    const review = screen.getByRole('region', { name: /revisión antes de finalizar/i })
    expect(within(review).getByRole('button', { name: /ver los \d+ errores/i })).toBeVisible()
    expect(within(review).queryByText(/Segundo artículo sin revisar/i)).not.toBeInTheDocument()
    fireEvent.click(within(review).getByRole('button', { name: /ver los \d+ errores/i }))
    expect(within(review).getAllByText(/Segundo artículo sin revisar/i)).toHaveLength(3)
  })

  it('blocks missing physical counts and rejected items, with a reversible rejection', async () => {
    const requests = []
    renderPage(createAdapter({
      detailsItems: [item({ existencia_lapiz: 0, revision_pendiente: 2 })],
      requests,
    }))
    await openReception()

    const review = screen.getByRole('region', { name: /revisión antes de finalizar/i })
    expect(within(review).getByText(/conteo físico debe ser mayor que cero/i)).toBeVisible()
    expect(within(review).getByText(/artículo rechazado/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /finalizar/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /restaurar Cuaderno caja/i }))
    fireEvent.change(screen.getByLabelText('FÍSICO Cuaderno caja'), { target: { value: '8' } })
    fireEvent.blur(screen.getByLabelText('FÍSICO Cuaderno caja'))

    await waitFor(() => expect(screen.getByRole('button', { name: /finalizar/i })).toBeEnabled())
    await waitFor(() => {
      const payloads = requests
        .filter((entry) => entry.url === '/api/recepciones/actualizar_campo')
        .map((entry) => JSON.parse(entry.data))
      expect(payloads).toEqual(expect.arrayContaining([
        { id_item: 11, campo: 'revision_pendiente', valor: 0 },
        { id_item: 11, campo: 'existencia_lapiz', valor: '8' },
      ]))
    })
  })

  it('exports with physical count disabled by default', async () => {
    const requests = []
    renderPage(createAdapter({ requests }))
    await openReception()

    const physicalExport = screen.getByRole('checkbox', { name: /incluir conteo físico/i })
    expect(physicalExport).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: /excel/i }))

    await waitFor(() => {
      const request = requests.find((entry) => entry.url === '/api/recepciones/generar_excel')
      expect(JSON.parse(request.data)).toEqual({ remision_id: 'REM-7', incluir_fisico: false })
    })
  })
})

describe('Recepciones preview and context', () => {
  it('previews selected XML files before enabling the definitive import', async () => {
    const requests = []
    renderPage(createAdapter({ requests }))
    fireEvent.click(await screen.findByRole('button', { name: /subir XML/i }))
    const file = new File(['<xml/>'], 'factura.xml', { type: 'application/xml' })
    fireEvent.change(screen.getByLabelText(/archivos XML o CSV/i), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /revisar archivos/i }))

    expect(await screen.findByText('REM-NUEVA')).toBeVisible()
    expect(screen.getByText(/nuevo/i)).toBeVisible()
    expect(screen.getByText(/1 artículo · 4 piezas · \$110\.20/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /importar 1 archivo/i })).toBeEnabled()
    expect(requests.some((request) => request.url === '/api/recepciones/upload')).toBe(false)
  })

  it('blocks definitive import when an earlier field save failed', async () => {
    const requests = []
    renderPage(createAdapter({ requests, failFieldSave: true }))
    await openReception()

    const physicalInput = screen.getByLabelText('FÍSICO Cuaderno caja')
    fireEvent.change(physicalInput, { target: { value: '9' } })
    fireEvent.blur(physicalInput)
    await waitFor(() => expect(requests.some((entry) => entry.url === '/api/recepciones/actualizar_campo')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: /subir XML/i }))
    const file = new File(['<xml/>'], 'reimport.xml', { type: 'application/xml' })
    fireEvent.change(screen.getByLabelText(/archivos XML o CSV/i), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /revisar archivos/i }))
    await screen.findByText('REM-NUEVA')
    fireEvent.click(screen.getByRole('button', { name: /importar 1 archivo/i }))

    await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cambios sin guardar' })))
    expect(requests.some((entry) => entry.url === '/api/recepciones/upload')).toBe(false)
  })

  it('refetches the open detail after reimporting the same reception', async () => {
    const requests = []
    renderPage(createAdapter({
      requests,
      uploadResponse: { success: true, mensaje: 'Actualizada', id_remision: 7 },
    }))
    await openReception()

    fireEvent.click(screen.getByRole('button', { name: /subir XML/i }))
    const file = new File(['<xml/>'], 'reimport.xml', { type: 'application/xml' })
    fireEvent.change(screen.getByLabelText(/archivos XML o CSV/i), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /revisar archivos/i }))
    await screen.findByText('REM-NUEVA')
    fireEvent.click(screen.getByRole('button', { name: /importar 1 archivo/i }))

    await waitFor(() => {
      expect(requests.filter((entry) => entry.url === '/api/recepciones/7' && entry.method === 'get')).toHaveLength(2)
    })
  })

  it('loads quick prior purchases only when the session has the price-history permission', async () => {
    const requests = []
    renderPage(createAdapter({ requests }), ['recepciones', 'evolucion-precios'])
    await openReception()
    fireEvent.click(screen.getByRole('button', { name: /compras previas de Cuaderno caja/i }))

    expect(await screen.findByText(/ANT-1/)).toBeVisible()
    expect(screen.getByText(/TONY · \$88\.00/)).toBeVisible()
    const request = requests.find((entry) => entry.url === '/api/evolucion-precios')
    expect(request.params).toEqual({ buscar_codigo: 'SICAR-11' })
  })
})
