import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSession, saveSession } from '@/auth/session'
import api from '@/lib/api'
import Recepciones from './Recepciones'

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
  clearSession()
  vi.clearAllMocks()
})

function renderReceptionPage() {
  saveSession({
    token: 'signed-token',
    user: { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos: ['recepciones', 'catalogo'] },
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><Recepciones /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Recepciones dialogs', () => {
  it('uses its controlled upload trigger and restores focus after Escape', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <Recepciones />
      </QueryClientProvider>,
    )

    const trigger = await screen.findByRole('button', { name: /subir xml/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: /cargar xml \/ csv/i })).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('normalizes pasted SICAR whitespace before saving and confirming without remounting the reception', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/recepciones') {
        return Promise.resolve({ data: { data: [{ id: 7, numero_remision: 'REM-7', proveedor: 'PAOLA', estado: 'PENDIENTE', items: 1 }] } })
      }
      if (url === '/api/recepciones/7') {
        return Promise.resolve({
          data: {
            proveedor: 'PAOLA',
            estado: 'PENDIENTE',
            datos: {
              'REM-7': [{
                id: 11,
                cod_prov: 'PROV-11',
                desc: 'ABACO PLAST CH BOLSA JOCAR',
                cant: 1,
                costo_unitario: 10,
                clave_final: '',
                clave_sicar: '',
                existencia_lapiz: 1,
                es_paquete: 0,
                piezas_por_paquete: 1,
                revision_pendiente: 0,
              }],
            },
          },
        })
      }
      if (url === '/api/catalogo/exact') {
        return Promise.resolve({
          data: {
            data: { clave_sicar: '7502269634659', descripcion: 'ABACO PLAST CH BOLSA JOCAR' },
          },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { ok: true } })

    renderReceptionPage()
    fireEvent.click(await screen.findByRole('button', { name: /REM-7/i }))
    expect(await screen.findByRole('heading', { name: /Orden #REM-7/i })).toBeVisible()

    const input = screen.getByLabelText(/SICAR de artículo ABACO/i)
    fireEvent.change(input, { target: { value: '  7502269634659\n' } })

    expect(screen.getByRole('status')).toHaveTextContent(/guardando/i)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/guardado/i))
    expect(screen.getByRole('heading', { name: /Orden #REM-7/i })).toBeVisible()
    expect(await screen.findByText(/SICAR confirmado/i)).toHaveTextContent(/ABACO PLAST CH BOLSA JOCAR/i)
    const catalogRequest = api.get.mock.calls.find(([url]) => url === '/api/catalogo/exact')
    expect(catalogRequest[1].params).toEqual({ code: '7502269634659' })
  })

  it('reconfirms a valid SICAR after only its outer whitespace changes', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/recepciones') {
        return Promise.resolve({ data: { data: [{ id: 7, numero_remision: 'REM-7', proveedor: 'PAOLA', estado: 'PENDIENTE', items: 1 }] } })
      }
      if (url === '/api/recepciones/7') {
        return Promise.resolve({
          data: {
            proveedor: 'PAOLA',
            estado: 'PENDIENTE',
            datos: {
              'REM-7': [{
                id: 11,
                cod_prov: 'PROV-11',
                desc: 'ABACO PLAST CH BOLSA JOCAR',
                cant: 1,
                costo_unitario: 10,
                clave_final: '7502269634659',
                clave_sicar: '7502269634659',
                existencia_lapiz: 1,
                es_paquete: 0,
                piezas_por_paquete: 1,
                revision_pendiente: 0,
              }],
            },
          },
        })
      }
      if (url === '/api/catalogo/exact') {
        return Promise.resolve({
          data: {
            data: { clave_sicar: '7502269634659', descripcion: 'ABACO PLAST CH BOLSA JOCAR' },
          },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { ok: true } })

    renderReceptionPage()
    fireEvent.click(await screen.findByRole('button', { name: /REM-7/i }))
    await screen.findByText(/SICAR confirmado/i)

    const input = screen.getByLabelText(/SICAR de artículo ABACO/i)
    fireEvent.change(input, { target: { value: '  7502269634659  ' } })

    expect(screen.getByText(/SICAR pendiente/i)).toBeVisible()
    expect(await screen.findByText(/SICAR confirmado/i)).toBeVisible()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/recepciones/actualizar_campo',
      { id_item: 11, campo: 'clave_final', valor: '  7502269634659  ' },
    ))
    const catalogRequests = api.get.mock.calls.filter(([url]) => url === '/api/catalogo/exact')
    expect(catalogRequests.at(-1)[1].params).toEqual({ code: '7502269634659' })

    fireEvent.change(input, { target: { value: '7502269634659' } })
    fireEvent.change(input, { target: { value: '  7502269634659  ' } })

    expect(screen.getByText(/SICAR pendiente/i)).toBeVisible()
    expect(await screen.findByText(/SICAR confirmado/i)).toBeVisible()
  })

  it('returns a previously confirmed SICAR to pending and then mismatch when its catalog code changes', async () => {
    api.get.mockImplementation((url, config) => {
      if (url === '/api/recepciones') {
        return Promise.resolve({ data: { data: [{ id: 7, numero_remision: 'REM-7', proveedor: 'PAOLA', estado: 'PENDIENTE', items: 1 }] } })
      }
      if (url === '/api/recepciones/7') {
        return Promise.resolve({
          data: {
            proveedor: 'PAOLA',
            estado: 'PENDIENTE',
            datos: {
              'REM-7': [{
                id: 11,
                cod_prov: 'PROV-11',
                desc: 'ABACO PLAST CH BOLSA JOCAR',
                cant: 1,
                costo_unitario: 10,
                clave_final: '7502269634659',
                clave_sicar: '7502269634659',
                existencia_lapiz: 1,
                es_paquete: 0,
                piezas_por_paquete: 1,
                revision_pendiente: 0,
              }],
            },
          },
        })
      }
      if (url === '/api/catalogo/exact') {
        const matches = config?.params?.code === '7502269634659'
        return Promise.resolve({ data: { data: { clave_sicar: matches ? '7502269634659' : 'OTRO-CODIGO', descripcion: 'ABACO PLAST CH BOLSA JOCAR' } } })
      }
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { ok: true } })

    renderReceptionPage()
    fireEvent.click(await screen.findByRole('button', { name: /REM-7/i }))
    await screen.findByText(/SICAR confirmado/i)

    fireEvent.change(screen.getByLabelText(/SICAR de artículo ABACO/i), { target: { value: 'NO-COINCIDE' } })

    expect(screen.getByText(/SICAR pendiente/i)).toBeVisible()
    expect(await screen.findByText(/SICAR no coincide/i)).toBeVisible()
  })

  it('keeps SICAR pending and explains catalog unavailability when lookup fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/recepciones') {
        return Promise.resolve({ data: { data: [{ id: 7, numero_remision: 'REM-7', proveedor: 'PAOLA', estado: 'PENDIENTE', items: 1 }] } })
      }
      if (url === '/api/recepciones/7') {
        return Promise.resolve({
          data: {
            proveedor: 'PAOLA',
            estado: 'PENDIENTE',
            datos: {
              'REM-7': [{
                id: 11,
                cod_prov: 'PROV-11',
                desc: 'ABACO PLAST CH BOLSA JOCAR',
                cant: 1,
                costo_unitario: 10,
                clave_final: '',
                clave_sicar: '',
                existencia_lapiz: 1,
                es_paquete: 0,
                piezas_por_paquete: 1,
                revision_pendiente: 0,
              }],
            },
          },
        })
      }
      if (url === '/api/catalogo/exact') return Promise.reject(new Error('Catálogo no disponible'))
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { ok: true } })

    renderReceptionPage()
    fireEvent.click(await screen.findByRole('button', { name: /REM-7/i }))
    fireEvent.change(await screen.findByLabelText(/SICAR de artículo ABACO/i), { target: { value: '7502269634659' } })

    expect(await screen.findByText(/SICAR pendiente.*catálogo no está disponible/i)).toBeVisible()
    expect(screen.queryByText(/SICAR no coincide/i)).not.toBeInTheDocument()
  })
})
