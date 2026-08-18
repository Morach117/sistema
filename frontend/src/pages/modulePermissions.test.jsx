import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import Swal from 'sweetalert2'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, saveSession } from '@/auth/session'
import api from '@/lib/api'
import Dashboard from './Dashboard'
import Recepciones from './Recepciones'

const originalApiAdapter = api.defaults.adapter

function employee(permisos) {
  return { id: 7, usuario: 'empleado', nombre: 'Empleado', rol: 'empleado', permisos }
}

function responseFor(config, data = {}) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: {},
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function renderPage(element, adapter) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  api.defaults.adapter = adapter

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function receptionAdapter(requestedUrls, itemDescription = 'Cuaderno') {
  return async (config) => {
    requestedUrls.push(config.url)
    if (config.url === '/api/recepciones' && config.method === 'get') {
      return responseFor(config, {
        data: [{
          id: 3,
          numero_remision: 'REM-3',
          estado: 'REVISION',
          fecha_carga: '2026-08-14',
          items: 1,
        }],
      })
    }
    if (config.url === '/api/recepciones/3') {
      return responseFor(config, {
        datos: {
          'REM-3': [{
            id: 9,
            desc: itemDescription,
            cod_prov: 'PROV-1',
            clave_final: 'SICAR-1',
            cant: 1,
            costo: 10,
            costo_unitario: 10,
            existencia_lapiz: 1,
            es_paquete: 0,
            piezas_por_paquete: 1,
            revision_pendiente: 0,
          }],
        },
        estado: 'REVISION',
      })
    }
    return responseFor(config, { data: [] })
  }
}

beforeEach(() => {
  window.scrollTo = () => {}
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false },
    }),
  })
})

afterEach(() => {
  cleanup()
  Swal.close()
  clearSession()
  api.defaults.adapter = originalApiAdapter
  vi.restoreAllMocks()
})

describe('cross-module permission boundaries', () => {
  it('does not query reclamaciones from a dashboard-only session and reports it as unavailable', async () => {
    const requestedUrls = []
    saveSession({ token: 'signed-token', user: employee(['dashboard']) })
    renderPage(<Dashboard />, async (config) => {
      requestedUrls.push(config.url)
      if (config.url === '/api/reclamaciones') return responseFor(config, { data: [] })
      return responseFor(config, { kpis: {}, activity: [], capturas_hoy: {} })
    })

    await screen.findByRole('heading', { name: 'Hola, Empleado' })
    await waitFor(() => expect(requestedUrls).toContain('/api/dashboard'))

    expect(requestedUrls).not.toContain('/api/reclamaciones')
    expect(screen.getByText(/reclamaciones no disponibles con tus permisos/i)).toBeVisible()
  })

  it('lets a recepciones-only session edit SICAR without calling the catalog module', async () => {
    const requestedUrls = []
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    renderPage(<Recepciones />, receptionAdapter(requestedUrls))

    fireEvent.click(await screen.findByRole('button', { name: /REM-3/i }))
    const sicarInput = await screen.findByLabelText('SICAR de artículo Cuaderno')
    fireEvent.change(sicarInput, { target: { value: 'SICAR-PRUEBA' } })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
    })

    expect(requestedUrls.some((url) => url.startsWith('/api/catalogo/'))).toBe(false)
    expect(screen.getByText(/validación de catálogo no disponible con tus permisos/i)).toBeVisible()
    expect(sicarInput).toHaveValue('SICAR-PRUEBA')
  })
})

describe('Recepciones untrusted text', () => {
  it('renders an item description as inert confirmation text instead of SweetAlert HTML', async () => {
    const requestedUrls = []
    const untrustedDescription = '<img src=x onerror="window.__xss=1">Producto externo'
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    renderPage(<Recepciones />, receptionAdapter(requestedUrls, untrustedDescription))

    fireEvent.click(await screen.findByRole('button', { name: /REM-3/i }))
    fireEvent.click(await screen.findByRole('button', { name: `Eliminar ${untrustedDescription}` }))

    const confirmationText = await screen.findByText(/se borrará permanentemente/i)
    const content = confirmationText.closest('.swal2-html-container')
    expect(content).not.toBeNull()
    expect(content).toHaveTextContent(untrustedDescription)
    expect(content.querySelector('img')).toBeNull()
  })
})

describe('Recepciones pending saves', () => {
  it('disables finalization and export until the confirmed field write settles', async () => {
    const requestedUrls = []
    const saveRequest = deferred()
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    const adapter = receptionAdapter(requestedUrls)
    renderPage(<Recepciones />, async (config) => {
      if (config.url === '/api/recepciones/actualizar_campo') {
        requestedUrls.push(config.url)
        return saveRequest.promise
      }
      return adapter(config)
    })

    fireEvent.click(await screen.findByRole('button', { name: /REM-3/i }))
    const quantity = await screen.findByLabelText('FACTURA Cuaderno')
    fireEvent.change(quantity, { target: { value: '4' } })
    fireEvent.blur(quantity)

    const exportButton = screen.getByRole('button', { name: /excel/i })
    const finalizeButton = screen.getByRole('button', { name: /finalizar/i })
    expect(exportButton).toBeDisabled()
    expect(finalizeButton).toBeDisabled()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    expect(requestedUrls).toContain('/api/recepciones/actualizar_campo')
    expect(exportButton).toBeDisabled()
    expect(finalizeButton).toBeDisabled()

    await act(async () => {
      saveRequest.resolve(responseFor({}, { ok: true }))
      await saveRequest.promise
    })

    await waitFor(() => expect(exportButton).toBeEnabled())
    expect(finalizeButton).toBeEnabled()
  })

  it('blocks export and explains the unsaved change after a field write fails', async () => {
    const requestedUrls = []
    const alertSpy = vi.spyOn(Swal, 'fire').mockResolvedValue({ isConfirmed: false })
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    const adapter = receptionAdapter(requestedUrls)
    renderPage(<Recepciones />, async (config) => {
      if (config.url === '/api/recepciones/actualizar_campo') {
        requestedUrls.push(config.url)
        return Promise.reject({ response: { status: 500, data: { error: 'No se guardó el campo' } } })
      }
      return adapter(config)
    })

    fireEvent.click(await screen.findByRole('button', { name: /REM-3/i }))
    const quantity = await screen.findByLabelText('FACTURA Cuaderno')
    fireEvent.change(quantity, { target: { value: '8' } })
    fireEvent.blur(quantity)

    const exportButton = screen.getByRole('button', { name: /excel/i })
    await waitFor(() => expect(requestedUrls).toContain('/api/recepciones/actualizar_campo'), { timeout: 1000 })
    await waitFor(() => expect(exportButton).toBeEnabled())
    fireEvent.click(exportButton)

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Cambios sin guardar',
      text: expect.stringMatching(/no se puede generar el Excel/i),
      icon: 'error',
    })))
    expect(requestedUrls).not.toContain('/api/recepciones/generar_excel')
  })

  it('keeps finalization disabled until a provider change settles', async () => {
    const requestedUrls = []
    const providerRequest = deferred()
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    const adapter = receptionAdapter(requestedUrls)
    renderPage(<Recepciones />, async (config) => {
      if (config.url === '/api/recepciones/asignar_proveedor') {
        requestedUrls.push(config.url)
        return providerRequest.promise
      }
      return adapter(config)
    })

    fireEvent.click(await screen.findByRole('button', { name: /REM-3/i }))
    fireEvent.change(await screen.findByLabelText('PROV'), { target: { value: 'tony' } })

    const finalizeButton = screen.getByRole('button', { name: /finalizar/i })
    await waitFor(() => expect(requestedUrls).toContain('/api/recepciones/asignar_proveedor'))
    expect(finalizeButton).toBeDisabled()

    await act(async () => {
      providerRequest.resolve(responseFor({}, { success: true }))
      await providerRequest.promise
    })

    await waitFor(() => expect(finalizeButton).toBeEnabled())
  })

  it('keeps finalization disabled until a confirmed item deletion settles', async () => {
    const requestedUrls = []
    const deleteRequest = deferred()
    vi.spyOn(Swal, 'fire').mockImplementation((options) => Promise.resolve({
      isConfirmed: options?.title === '¿Eliminar ítem?',
    }))
    saveSession({ token: 'signed-token', user: employee(['recepciones']) })
    const adapter = receptionAdapter(requestedUrls)
    renderPage(<Recepciones />, async (config) => {
      if (config.url === '/api/recepciones/item/9' && config.method === 'delete') {
        requestedUrls.push(config.url)
        return deleteRequest.promise
      }
      return adapter(config)
    })

    fireEvent.click(await screen.findByRole('button', { name: /REM-3/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Cuaderno' }))

    const finalizeButton = screen.getByRole('button', { name: /finalizar/i })
    await waitFor(() => expect(requestedUrls).toContain('/api/recepciones/item/9'))
    expect(finalizeButton).toBeDisabled()

    await act(async () => {
      deleteRequest.resolve(responseFor({}, { success: true }))
      await deleteRequest.promise
    })

    await waitFor(() => expect(finalizeButton).toBeEnabled())
  })
})
