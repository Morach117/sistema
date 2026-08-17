import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ThemeProvider } from 'next-themes'
import { MemoryRouter } from 'react-router-dom'
import { clearSession, saveSession } from '@/auth/session'
import AppShell from './AppShell'
import ThemeToggle from './ThemeToggle'

let desktopViewport = false
const desktopViewportListeners = new Set()

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query) => ({
      matches: query === '(min-width: 1024px)' ? desktopViewport : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (event, listener) => {
        if (query === '(min-width: 1024px)' && event === 'change') {
          desktopViewportListeners.add(listener)
        }
      },
      removeEventListener: (event, listener) => {
        if (query === '(min-width: 1024px)' && event === 'change') {
          desktopViewportListeners.delete(listener)
        }
      },
      dispatchEvent: vi.fn(),
    })),
  })
})

function enterDesktopViewport() {
  desktopViewport = true
  for (const listener of desktopViewportListeners) {
    listener({ matches: true, media: '(min-width: 1024px)' })
  }
}

function employee(permisos) {
  return {
    id: 7,
    usuario: 'empleado',
    nombre: 'Empleado',
    rol: 'empleado',
    permisos,
  }
}

function renderShell(user = employee(['dashboard']), path = '/dashboard') {
  saveSession({ token: 'signed-token', user })

  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell><p>Contenido</p></AppShell>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

afterEach(() => {
  cleanup()
  desktopViewport = false
  clearSession()
  localStorage.removeItem('theme')
  document.documentElement.classList.remove('light', 'dark')
})

describe('AppShell', () => {
  it('opens the mobile navigation with an accessible control', () => {
    renderShell()

    const trigger = screen.getByRole('button', { name: /abrir navegación/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: /principal/i })).toBeVisible()
  })

  it('preserves permission filtering in the application navigation', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /abrir navegación/i }))

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /bodega/i })).not.toBeInTheDocument()
  })

  it('shows clients by permission while keeping LAN configuration administrator-only', () => {
    const { unmount } = renderShell(employee(['clientes']), '/clientes')

    expect(screen.getByRole('link', { name: /^clientes$/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: /configuración de clientes/i })).not.toBeInTheDocument()

    unmount()
    renderShell({ id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin', permisos: [] }, '/clientes-configuracion')

    expect(screen.getByRole('link', { name: /^clientes$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /configuración de clientes/i })).toHaveAttribute('aria-current', 'page')
  })

  it('moves focus into the drawer and returns it after Escape', () => {
    renderShell()
    const trigger = screen.getByRole('button', { name: /abrir navegación/i })

    fireEvent.click(trigger)

    expect(screen.getByRole('dialog', { name: /menú de aplicación/i })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('contains keyboard focus and makes covered content inert while open', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /abrir navegación/i }))

    const drawer = screen.getByRole('dialog', { name: /menú de aplicación/i })
    const firstDrawerControl = within(drawer).getByRole('button', { name: 'Cambiar tema' })
    const coveredContent = document.getElementById('main-content').parentElement

    expect(coveredContent).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(drawer, { key: 'Tab' })
    expect(firstDrawerControl).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(coveredContent).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
  })

  it('clears mobile modal state when the viewport becomes desktop sized', () => {
    renderShell()
    const trigger = screen.getByRole('button', { name: /abrir navegación/i })
    fireEvent.click(trigger)

    act(() => enterDesktopViewport())

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('main-content').parentElement).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
  })
})

describe('ThemeToggle', () => {
  it('applies and persists the selected theme', async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>,
    )

    const toggle = await screen.findByRole('button', { name: 'Cambiar tema' })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
      expect(localStorage.getItem('theme')).toBe('dark')
    })
  })
})
