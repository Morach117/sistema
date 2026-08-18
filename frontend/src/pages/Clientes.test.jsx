import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, saveSession } from '@/auth/session'
import api from '@/lib/api'
import Clientes from './Clientes'
import ClientesConfiguracion from './ClientesConfiguracion'

const originalAdapter = api.defaults.adapter
const BRANCH_ID = '14c5c4e7-443c-42e9-b906-96cc704675ae'
const CLIENT_ID = '7b34f30e-31e8-44f5-9db3-d81220d10070'
const SECOND_CLIENT_ID = '5578afe3-8f2c-4b76-8fa7-daa06ec25e26'

function responseFor(config, data = {}) {
  return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
}

function bodyOf(config) {
  if (!config.data) return {}
  return typeof config.data === 'string' ? JSON.parse(config.data) : config.data
}

function syncStatus(overrides = {}) {
  return {
    sucursal: { nombre: 'Sucursal Norte', rol: 'sucursal' },
    centralVinculada: true,
    centralFingerprint: 'a'.repeat(64),
    estado: 'conectado',
    pendientes: 0,
    conflictos: 0,
    ...overrides,
  }
}

function createAdapter({ status = syncStatus(), statusError = false, clientsError = false, requests = [], extraClients = [], purchaseError = false } = {}) {
  let currentStatus = status
  let unavailableStatus = statusError
  let clients = [{
    id: CLIENT_ID,
    origen_sucursal_id: BRANCH_ID,
    nombre: 'Ana López',
    telefono: '555-0100',
    correo: 'ana@example.com',
    notas: 'Prefiere factura impresa',
    activo: true,
    version: 1,
  }, ...extraClients]
  const purchases = []

  return async (config) => {
    requests.push(config)
    const method = config.method || 'get'

    if (config.url === '/api/clientes-sync/estado' && method === 'get') {
      if (unavailableStatus) {
        const error = new Error('Esta instalación no tiene identidad LAN configurada.')
        error.response = { status: 409, data: { error: error.message } }
        throw error
      }
      return responseFor(config, { success: true, data: currentStatus })
    }
    if (config.url === '/api/clientes-sync/configuracion' && method === 'put') {
      const payload = bodyOf(config)
      currentStatus = syncStatus({
        sucursal: { nombre: payload.nombre, rol: payload.rol_nodo },
        centralVinculada: payload.rol_nodo === 'central',
        centralFingerprint: payload.rol_nodo === 'central' ? 'a'.repeat(64) : null,
        estado: payload.rol_nodo === 'central' ? 'central' : 'sin-vincular',
      })
      unavailableStatus = false
      return responseFor(config, { success: true, data: { sucursal: currentStatus.sucursal } })
    }
    if (config.url === '/api/clientes' && method === 'get') {
      if (clientsError) {
        const error = new Error('Directorio local no disponible')
        error.response = { status: 503, data: { error: error.message } }
        throw error
      }
      const term = String(config.params?.buscar || '').toLowerCase()
      const data = clients.filter((client) => !term || [client.nombre, client.telefono, client.correo]
        .some((value) => String(value || '').toLowerCase().includes(term)))
      return responseFor(config, {
        success: true,
        data,
        paginacion: { pagina: 1, limite: 50, total: data.length, totalPaginas: 1 },
      })
    }
    if (config.url === '/api/clientes' && method === 'post') {
      const payload = bodyOf(config)
      const created = {
        id: '5578afe3-8f2c-4b76-8fa7-daa06ec25e26',
        origen_sucursal_id: BRANCH_ID,
        activo: true,
        version: 1,
        ...payload,
      }
      clients = [created, ...clients]
      return responseFor(config, { success: true, data: created })
    }
    if (config.url === `/api/clientes/${CLIENT_ID}` && method === 'get') {
      return responseFor(config, { success: true, data: clients.find((client) => client.id === CLIENT_ID) })
    }
    if (config.url === `/api/clientes/${SECOND_CLIENT_ID}` && method === 'get') {
      return responseFor(config, { success: true, data: clients.find((client) => client.id === SECOND_CLIENT_ID) })
    }
    if (config.url === `/api/clientes/${CLIENT_ID}` && method === 'put') {
      const payload = bodyOf(config)
      clients = clients.map((client) => client.id === CLIENT_ID
        ? { ...client, ...payload, version: client.version + 1 }
        : client)
      return responseFor(config, { success: true, data: clients.find((client) => client.id === CLIENT_ID) })
    }
    if (config.url === `/api/clientes/${CLIENT_ID}/desactivar` && method === 'post') {
      clients = clients.map((client) => client.id === CLIENT_ID
        ? { ...client, activo: false, version: client.version + 1 }
        : client)
      return responseFor(config, { success: true, data: clients.find((client) => client.id === CLIENT_ID) })
    }
    if (config.url === `/api/clientes/${CLIENT_ID}/compras` && method === 'get') {
      if (purchaseError) throw new Error('Historial local no disponible')
      return responseFor(config, {
        success: true,
        data: purchases,
        paginacion: { pagina: 1, limite: 25, total: purchases.length, totalPaginas: 1 },
      })
    }
    if (config.url === `/api/clientes/${SECOND_CLIENT_ID}/compras` && method === 'get') {
      return responseFor(config, { success: true, data: [], paginacion: { pagina: 1, limite: 25, total: 0, totalPaginas: 0 } })
    }
    if (config.url === `/api/clientes/${CLIENT_ID}/compras` && method === 'post') {
      const payload = bodyOf(config)
      const purchase = {
        id: `purchase-${purchases.length + 1}`,
        cliente_id: CLIENT_ID,
        sucursal_id: BRANCH_ID,
        fecha_compra: '2026-08-15T12:00:00.000Z',
        version: 1,
        ...payload,
      }
      purchases.unshift(purchase)
      return responseFor(config, { success: true, data: purchase })
    }
    if (config.url === '/api/clientes-sync/descubrir' && method === 'post') {
      return responseFor(config, {
        success: true,
        data: { address: '192.168.20.5', port: 4312, centralFingerprint: 'a'.repeat(64) },
      })
    }
    if (config.url === '/api/clientes-sync/codigo-vinculo' && method === 'post') {
      return responseFor(config, { success: true, data: { code: 'codigo-firmado' } })
    }
    if (config.url === '/api/clientes-sync/emparejar' && method === 'post') {
      return responseFor(config, { success: true, data: { centralId: 'central-id' } })
    }
    throw new Error(`Solicitud inesperada: ${method.toUpperCase()} ${config.url}`)
  }
}

function renderPage(element, adapter, { role = 'admin', permissions = ['clientes'] } = {}) {
  saveSession({
    token: 'signed-token',
    user: { id: 1, usuario: role, nombre: 'Usuario local', rol: role, permisos: permissions },
  })
  api.defaults.adapter = adapter
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openClient() {
  fireEvent.click(await screen.findByRole('button', { name: 'Ana López' }))
  return screen.findByRole('region', { name: /ficha de Ana López/i })
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  clearSession()
  api.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
})

describe('Clientes CRUD and local branch attribution', () => {
  it('guides a first-run installation to configuration instead of displaying a technical sync failure', async () => {
    renderPage(<Clientes />, createAdapter({
      status: syncStatus({
        configuracionRequerida: true,
        sucursal: null,
        centralVinculada: false,
        centralFingerprint: null,
        estado: 'configuracion-requerida',
      }),
    }))

    expect(await screen.findByText(/primero configura esta pc/i)).toBeVisible()
    expect(screen.getByRole('link', { name: /configurar esta pc/i })).toHaveAttribute('href', '/clientes-configuracion')
  })

  it('creates a client while showing the server-detected branch as non-editable', async () => {
    const requests = []
    renderPage(<Clientes />, createAdapter({ requests }))

    fireEvent.click(await screen.findByRole('button', { name: /nuevo cliente/i }))
    const form = screen.getByRole('form', { name: /nuevo cliente/i })
    expect(within(form).getByLabelText(/sucursal detectada/i)).toHaveAttribute('readonly')
    expect(within(form).getByLabelText(/sucursal detectada/i)).toHaveValue('Sucursal Norte')

    fireEvent.change(within(form).getByLabelText(/^nombre/i), { target: { value: 'Beatriz Ruiz' } })
    fireEvent.change(within(form).getByLabelText(/teléfono/i), { target: { value: '555-0200' } })
    fireEvent.change(within(form).getByLabelText(/correo/i), { target: { value: 'bea@example.com' } })
    fireEvent.change(within(form).getByLabelText(/notas/i), { target: { value: 'Cliente frecuente' } })
    fireEvent.click(within(form).getByRole('button', { name: /guardar cliente/i }))

    expect(await screen.findByRole('button', { name: 'Beatriz Ruiz' })).toBeVisible()
    const createRequest = requests.find((request) => request.url === '/api/clientes' && request.method === 'post')
    expect(bodyOf(createRequest)).toEqual({
      nombre: 'Beatriz Ruiz',
      telefono: '555-0200',
      correo: 'bea@example.com',
      notas: 'Cliente frecuente',
    })
    expect(bodyOf(createRequest)).not.toHaveProperty('sucursal_id')
    expect(bodyOf(createRequest)).not.toHaveProperty('origen_sucursal_id')
  })

  it('edits and deactivates a client without deleting the record', async () => {
    const requests = []
    renderPage(<Clientes />, createAdapter({ requests }))
    const detail = await openClient()

    fireEvent.click(within(detail).getByRole('button', { name: /editar cliente/i }))
    const form = screen.getByRole('form', { name: /editar cliente/i })
    fireEvent.change(within(form).getByLabelText(/^nombre/i), { target: { value: 'Ana López García' } })
    fireEvent.click(within(form).getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('button', { name: 'Ana López García' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ana López García' }))
    const updatedDetail = await screen.findByRole('region', { name: /ficha de Ana López García/i })
    fireEvent.click(within(updatedDetail).getByRole('button', { name: /desactivar cliente/i }))

    expect(await within(updatedDetail).findByText(/cliente inactivo/i)).toBeVisible()
    expect(requests.some((request) => request.url === `/api/clientes/${CLIENT_ID}/desactivar` && request.method === 'post')).toBe(true)
    expect(requests.some((request) => request.method === 'delete')).toBe(false)
  })
})

describe('Clientes purchases and synchronization state', () => {
  it('keeps the directory visible when sync status fails', async () => {
    renderPage(<Clientes />, createAdapter({ statusError: true }))

    expect(await screen.findByRole('button', { name: 'Ana López' })).toBeVisible()
    expect(screen.getByText(/siguen guardándose localmente/i)).toBeVisible()
  })

  it('renders a retryable directory error rather than a blank page', async () => {
    renderPage(<Clientes />, createAdapter({ clientsError: true }))

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.getByRole('button', { name: /reintentar clientes/i })).toBeVisible()
  })

  it('reports a purchase history failure instead of claiming the history is empty', async () => {
    renderPage(<Clientes />, createAdapter({ purchaseError: true }))

    const detail = await openClient()

    expect(await within(detail).findByRole('alert')).toHaveTextContent(/historial local no disponible/i)
    expect(within(detail).queryByText(/aún no tiene compras/i)).not.toBeInTheDocument()
  })

  it('clears an in-progress sale when switching to another cached client', async () => {
    renderPage(<Clientes />, createAdapter({
      extraClients: [{
        id: SECOND_CLIENT_ID,
        origen_sucursal_id: BRANCH_ID,
        nombre: 'Beatriz Ruiz',
        telefono: '555-0200',
        correo: null,
        notas: null,
        activo: true,
        version: 1,
      }],
    }))

    fireEvent.click(await screen.findByRole('button', { name: 'Beatriz Ruiz' }))
    await screen.findByRole('region', { name: /ficha de Beatriz Ruiz/i })
    fireEvent.click(screen.getByRole('button', { name: 'Ana López' }))
    const ana = await screen.findByRole('region', { name: /ficha de Ana López/i })
    fireEvent.click(within(ana).getByRole('button', { name: /registrar venta/i }))
    fireEvent.change(screen.getByLabelText(/folio.*opcional/i), { target: { value: 'A-100' } })
    fireEvent.change(screen.getByLabelText(/^total/i), { target: { value: '80' } })

    fireEvent.click(screen.getByRole('button', { name: 'Beatriz Ruiz' }))
    await screen.findByRole('region', { name: /ficha de Beatriz Ruiz/i })

    expect(screen.queryByRole('form', { name: /registrar venta/i })).not.toBeInTheDocument()
  })

  it('registers sales with a folio and without one, keeping folio optional', async () => {
    const requests = []
    renderPage(<Clientes />, createAdapter({ requests }))
    const detail = await openClient()

    fireEvent.click(within(detail).getByRole('button', { name: /registrar venta/i }))
    let saleForm = screen.getByRole('form', { name: /registrar venta/i })
    expect(within(saleForm).getByLabelText(/folio.*opcional/i)).not.toBeRequired()
    fireEvent.change(within(saleForm).getByLabelText(/folio.*opcional/i), { target: { value: 'T-100' } })
    fireEvent.change(within(saleForm).getByLabelText(/^total/i), { target: { value: '50' } })
    fireEvent.click(within(saleForm).getByRole('button', { name: /guardar venta/i }))
    expect(await within(detail).findByText('T-100')).toBeVisible()

    fireEvent.click(within(detail).getByRole('button', { name: /registrar venta/i }))
    saleForm = screen.getByRole('form', { name: /registrar venta/i })
    fireEvent.change(within(saleForm).getByLabelText(/^total/i), { target: { value: '25' } })
    fireEvent.click(within(saleForm).getByRole('button', { name: /guardar venta/i }))

    await within(detail).findByText('$25.00')
    const saleBodies = requests
      .filter((request) => request.url === `/api/clientes/${CLIENT_ID}/compras` && request.method === 'post')
      .map(bodyOf)
    expect(saleBodies).toEqual([
      { folio_ticket: 'T-100', total: 50 },
      { total: 25 },
    ])
  })

  it('warns that work remains local while the central is offline and exposes pending conflicts', async () => {
    renderPage(<Clientes />, createAdapter({
      status: syncStatus({ estado: 'offline', pendientes: 3, conflictos: 1 }),
    }))

    const status = await screen.findByRole('status', { name: /estado de sincronización/i })
    expect(await within(status).findByText(/sin conexión a central/i)).toBeVisible()
    expect(within(status).getByText(/3 cambios pendientes/i)).toBeVisible()
    expect(within(status).getByText(/1 conflicto/i)).toBeVisible()
    expect(within(status).getByText(/puedes seguir trabajando/i)).toBeVisible()
  })
})

describe('Configuración LAN de clientes', () => {
  it('initializes a fresh installation with an explicit role and visible name', async () => {
    const requests = []
    renderPage(<ClientesConfiguracion />, createAdapter({ statusError: true, requests }))

    await screen.findByRole('alert')
    const name = screen.getByLabelText(/^nombre visible$/i)
    fireEvent.click(screen.getByRole('button', { name: /esta será la central/i }))
    fireEvent.change(name, { target: { value: 'Matriz' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar instalación/i }))

    await screen.findByDisplayValue('Matriz')
    const configuration = requests.find((request) => request.url === '/api/clientes-sync/configuracion')
    expect(bodyOf(configuration)).toEqual({ rol_nodo: 'central', nombre: 'Matriz' })
  })

  it('searches for the central through the same-origin local API without asking for a manual IP', async () => {
    const requests = []
    renderPage(<ClientesConfiguracion />, createAdapter({
      requests,
      status: syncStatus({
        centralVinculada: false,
        centralFingerprint: null,
        estado: 'sin-vincular',
        centralesDetectadas: [{
          name: 'Central Matriz',
          fingerprint: 'a'.repeat(64),
          seenAt: '2026-08-18T12:00:00.000Z',
        }],
      }),
    }))

    expect(await screen.findByRole('heading', { name: /configuración de clientes/i })).toBeVisible()
    await screen.findByDisplayValue('Sucursal Norte')
    expect(screen.getByLabelText(/rol de esta instalación/i)).toHaveValue('sucursal')
    expect(screen.getByLabelText(/rol de esta instalación/i)).toBeDisabled()
    expect(screen.getByLabelText(/nombre visible/i)).toHaveValue('Sucursal Norte')
    expect(screen.getByLabelText(/nombre visible/i)).not.toHaveAttribute('readonly')
    expect(screen.queryByLabelText(/identificador de sucursal/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/dirección ip|hostname|servidor manual/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Central Matriz.*pendiente de autorización/i }))
    fireEvent.change(screen.getByLabelText(/código de vínculo/i), { target: { value: 'codigo-firmado' } })
    fireEvent.click(screen.getByRole('button', { name: /validar código/i }))

    expect(await screen.findByText(/código temporal e identidad firmada validados/i)).toBeVisible()
    const discovery = requests.find((request) => request.url === '/api/clientes-sync/descubrir')
    expect(bodyOf(discovery)).toEqual({
      codigo_vinculo: 'codigo-firmado',
      central_fingerprint: 'a'.repeat(64),
    })
    expect(requests.every((request) => request.url.startsWith('/api/'))).toBe(true)
  })
})
