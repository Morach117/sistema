import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import App from '@/App'
import { clearSession, saveSession } from '@/auth/session'
import api from '@/lib/api'

const originalAdapter = api.defaults.adapter

function responseFor(config, data = {}, headers = {}) {
  return { data, status: 200, statusText: 'OK', headers, config, request: {} }
}

const historyRow = {
  id: 77,
  numero_remision: 'REM-77',
  proveedor: 'TONY',
  fecha_carga: '2026-08-15 10:00:00',
  estado: 'PENDIENTE',
  items: 1,
}

function historyDetail({ editable }) {
  return {
    success: true,
    remision: historyRow,
    estado: 'PENDIENTE',
    proveedor: 'TONY',
    datos: {
      'REM-77': [{
        id: 501,
        cod_prov: 'TONY-1',
        desc: 'Marcador azul',
        cant: 20,
        costo_unitario: 30,
        clave_final: 'SICAR-501',
        clave_sicar: 'SICAR-501',
        existencia_lapiz: 2,
        es_paquete: 1,
        piezas_por_paquete: 10,
        aplica_descuento: 1,
        aplica_descuento_manual: null,
        revision_pendiente: 0,
      }],
    },
    notas: [{ id: 8, item_id: null, nota: 'Factura revisada', usuario: 'Ana', fecha: '2026-08-15 11:00:00' }],
    bitacora: [{ id: 9, item_id: 501, usuario: 'Ana', campo: 'cantidad', valor_anterior: '10', valor_nuevo: '20', fecha: '2026-08-15 11:10:00' }],
    permisos: { soloLectura: !editable, puedeEditar: editable, puedeExportar: editable },
  }
}

function historyAdapter(requests, { editable = false } = {}) {
  return async (config) => {
    requests.push(config)
    if (config.url === '/api/historial-recepciones/77' && config.method === 'get') {
      return responseFor(config, historyDetail({ editable }))
    }
    if (config.url === '/api/historial-recepciones' && config.method === 'get') {
      return responseFor(config, {
        success: true,
        data: [historyRow],
        paginacion: { pagina: config.params?.page || 1, limite: 25, total: 26, totalPaginas: 2 },
      })
    }
    if (config.url === '/api/historial-recepciones/77/excel') {
      return responseFor(config, new Blob(['excel']), { 'content-disposition': 'attachment; filename="REM-77.xls"' })
    }
    return responseFor(config, { success: true })
  }
}

function renderHistory({ role = 'empleado', editable = false } = {}) {
  const requests = []
  const user = role === 'admin'
    ? { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos: [] }
    : { id: 7, usuario: 'empleado', nombre: 'Empleado', rol: 'empleado', permisos: ['historial-recepciones'] }
  saveSession({ token: 'signed-token', user })
  api.defaults.adapter = historyAdapter(requests, { editable })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/historial-recepciones']}><App /></MemoryRouter>
    </QueryClientProvider>,
  )
  return requests
}

afterEach(() => {
  cleanup()
  clearSession()
  api.defaults.adapter = originalAdapter
})

it('queries history with its own permission, debounced backend filters and server pagination', async () => {
  const requests = renderHistory()

  expect(await screen.findByRole('heading', { name: /historial de recepciones/i }, { timeout: 5_000 })).toBeVisible()
  expect(screen.getByRole('link', { name: /historial de recepciones/i })).toBeVisible()
  await waitFor(() => {
    const firstList = requests.find((request) => request.url === '/api/historial-recepciones')
    expect(firstList?.params).toMatchObject({ page: 1, limit: 25 })
  })

  fireEvent.change(screen.getByLabelText(/buscar folio/i), { target: { value: 'REM-77' } })
  fireEvent.change(screen.getByLabelText(/buscar producto/i), { target: { value: 'Marcador' } })
  fireEvent.change(screen.getByLabelText(/estado/i), { target: { value: 'PENDIENTE' } })
  await waitFor(() => {
    const filtered = requests.filter((request) => request.url === '/api/historial-recepciones').at(-1)
    expect(filtered.params).toMatchObject({ folio: 'REM-77', producto: 'Marcador', estado: 'PENDIENTE', page: 1 })
  }, { timeout: 1200 })

  fireEvent.click(screen.getByRole('button', { name: /página siguiente/i }))
  await waitFor(() => {
    const pageTwo = requests.filter((request) => request.url === '/api/historial-recepciones').at(-1)
    expect(pageTwo.params.page).toBe(2)
  })
})

it('keeps a limited history session read only while exposing detail, notes and audit', async () => {
  renderHistory()
  fireEvent.click(await screen.findByRole('button', { name: /abrir REM-77/i }))

  const detail = await screen.findByRole('region', { name: /detalle de REM-77/i })
  expect(within(detail).getByText(/solo lectura/i)).toBeVisible()
  expect(within(detail).getByText('Factura revisada')).toBeVisible()
  expect(within(detail).getByText(/^cantidad:/i)).toBeVisible()
  expect(within(detail).getByText(/10 → 20/)).toBeVisible()
  expect(within(detail).getByLabelText(/cantidad de Marcador azul/i)).toBeDisabled()
  expect(within(detail).queryByRole('button', { name: /exportar excel/i })).not.toBeInTheDocument()
  expect(within(detail).queryByRole('button', { name: /guardar nota/i })).not.toBeInTheDocument()
  expect(within(detail).queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
})

it('opens a receipt detail in a dialog and retains the filtered results after closing it', async () => {
  renderHistory()

  fireEvent.change(screen.getByLabelText(/buscar folio/i), { target: { value: 'REM-77' } })
  const openReceipt = await screen.findByRole('button', { name: /abrir REM-77/i })
  fireEvent.click(openReceipt)

  expect(await screen.findByRole('dialog', { name: /recepción REM-77/i })).toHaveTextContent('REM-77')
  fireEvent.click(screen.getByRole('button', { name: /cerrar detalle/i }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText(/buscar folio/i)).toHaveValue('REM-77')
  expect(screen.getByRole('button', { name: /abrir REM-77/i })).toBeVisible()
})

it('lets an administrator edit a pending reception, add notes and export Excel without physical by default', async () => {
  const requests = renderHistory({ role: 'admin', editable: true })
  fireEvent.click(await screen.findByRole('button', { name: /abrir REM-77/i }))

  const detail = await screen.findByRole('region', { name: /detalle de REM-77/i })
  const quantity = within(detail).getByLabelText(/cantidad de Marcador azul/i)
  expect(quantity).toBeEnabled()
  expect(within(detail).getByRole('checkbox', { name: /incluir conteo físico/i })).not.toBeChecked()
  expect(within(detail).getByRole('button', { name: /exportar excel/i })).toBeEnabled()
  const saveNote = within(detail).getByRole('button', { name: /guardar nota/i })
  expect(saveNote).toBeDisabled()
  fireEvent.change(within(detail).getByLabelText(/contenido/i), { target: { value: 'Verificado contra factura' } })
  expect(saveNote).toBeEnabled()

  fireEvent.change(quantity, { target: { value: '25' } })
  fireEvent.blur(quantity)
  await waitFor(() => {
    const write = requests.find((request) => request.url === '/api/historial-recepciones/actualizar_campo')
    expect(JSON.parse(write.data)).toEqual({ id_item: 501, campo: 'cantidad', valor: '25' })
  })
  expect(within(detail).queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
})
