import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRightLeft,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareWarning,
  Package,
  PackageOpen,
  ScanBarcode,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { canAccess } from '@/auth/permissions'
import { clearSession, readSession } from '@/auth/session'
import ThemeToggle from './ThemeToggle'

const primaryItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Bodega / Inventario', path: '/bodega', icon: Package },
  { name: 'Generar Traspaso', path: '/traspasos', icon: ArrowLeftRight },
  { name: 'Captura Inteligente', path: '/captura', icon: ScanBarcode },
  { name: 'Recepción (Activos)', path: '/recepciones', icon: PackageOpen },
  { name: 'Historial de Recepciones', path: '/historial-recepciones', icon: History },
  { name: 'Reclamaciones', path: '/reclamaciones', icon: MessageSquareWarning },
]

const adminItems = [
  { name: 'Auditoría de Captura', path: '/auditoria', icon: ShieldAlert },
  { name: 'Auditoría Traspasos', path: '/admin-traspasos', icon: ArrowRightLeft },
  { name: 'Catálogo Maestro', path: '/catalogo', icon: Search },
  { name: 'Evolución Precios', path: '/evolucion-precios', icon: TrendingUp },
  { name: 'Gestión Usuarios', path: '/usuarios', icon: Users },
]

const focusStyles = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function NavigationLink({ item, active, onNavigate }) {
  const Icon = item.icon

  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${focusStyles} ${
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      <span>{item.name}</span>
    </Link>
  )
}

export default function AppShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const mobileNavigationTriggerRef = useRef(null)
  const mobileNavigationRef = useRef(null)
  const mobileNavigationWasOpen = useRef(false)
  const user = readSession()?.user || {
    nombre: 'Usuario',
    rol: 'empleado',
    permisos: [],
  }
  const visiblePrimaryItems = primaryItems.filter((item) => canAccess(user, item.path.slice(1)))

  useEffect(() => {
    setMobileNavigationOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined

    const desktopViewportQuery = window.matchMedia('(min-width: 1024px)')
    const closeAtDesktopWidth = (event) => {
      if (event.matches) setMobileNavigationOpen(false)
    }

    if (desktopViewportQuery.matches) setMobileNavigationOpen(false)
    desktopViewportQuery.addEventListener('change', closeAtDesktopWidth)
    return () => desktopViewportQuery.removeEventListener('change', closeAtDesktopWidth)
  }, [])

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false)
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileNavigationOpen])

  useEffect(() => {
    if (mobileNavigationOpen) {
      mobileNavigationRef.current?.focus()
    } else if (mobileNavigationWasOpen.current) {
      mobileNavigationTriggerRef.current?.focus()
    }

    mobileNavigationWasOpen.current = mobileNavigationOpen
  }, [mobileNavigationOpen])

  const handleLogout = () => {
    clearSession()
    navigate('/login')
  }

  const containDrawerFocus = (event) => {
    if (event.key !== 'Tab' || !mobileNavigationOpen) return

    const focusableElements = Array.from(mobileNavigationRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || [])
    const firstElement = focusableElements[0]
    const lastElement = focusableElements.at(-1)

    if (!firstElement || !lastElement) {
      event.preventDefault()
      return
    }

    if (event.shiftKey && (document.activeElement === firstElement || document.activeElement === mobileNavigationRef.current)) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && (document.activeElement === lastElement || document.activeElement === mobileNavigationRef.current)) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <div className="relative flex min-h-dvh bg-background font-sans text-foreground">
      <a
        href="#main-content"
        className={`sr-only z-50 rounded-lg bg-background px-4 py-3 text-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 ${focusStyles}`}
      >
        Saltar al contenido principal
      </a>

      {mobileNavigationOpen && (
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={() => setMobileNavigationOpen(false)}
          className="fixed inset-0 z-20 bg-slate-950/60 lg:hidden"
        />
      )}

      <aside
        ref={mobileNavigationRef}
        id="application-navigation"
        role={mobileNavigationOpen ? 'dialog' : undefined}
        aria-label={mobileNavigationOpen ? 'Menú de aplicación' : undefined}
        aria-modal={mobileNavigationOpen ? 'true' : undefined}
        tabIndex="-1"
        onKeyDown={containDrawerFocus}
        className={`fixed inset-y-0 left-0 z-30 flex w-[min(18rem,calc(100vw-3rem))] flex-col border-r border-border bg-[hsl(var(--surface)/0.96)] shadow-2xl backdrop-blur-xl transition-[transform,visibility] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none lg:sticky lg:top-0 lg:h-dvh lg:w-72 lg:translate-x-0 lg:visible ${
          mobileNavigationOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-lg font-black tracking-tight">
              <Package aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
              Papelería Yazmín
            </h1>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              React v4.0 Pro
            </p>
          </div>
          <ThemeToggle />
        </div>

        <nav aria-label="Navegación principal" className="custom-scrollbar flex-1 space-y-1.5 overflow-y-auto p-4">
          {visiblePrimaryItems.map((item) => (
            <NavigationLink
              key={item.path}
              item={item}
              active={location.pathname === item.path}
              onNavigate={() => setMobileNavigationOpen(false)}
            />
          ))}

          {user.rol === 'admin' && (
            <div className="pt-6">
              <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Administración
              </p>
              <div className="space-y-1.5">
                {adminItems.map((item) => (
                  <NavigationLink
                    key={item.path}
                    item={item}
                    active={location.pathname === item.path}
                    onNavigate={() => setMobileNavigationOpen(false)}
                  />
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-border bg-background/40 p-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary font-black text-secondary-foreground">
              {user.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{user.nombre}</p>
              <p className="truncate text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {user.rol}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive ${focusStyles}`}
          >
            <LogOut aria-hidden="true" className="h-5 w-5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <div inert={mobileNavigationOpen} className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-[hsl(var(--surface)/0.9)] px-4 backdrop-blur-xl lg:hidden">
          <button
            ref={mobileNavigationTriggerRef}
            type="button"
            aria-label={mobileNavigationOpen ? 'Cerrar navegación' : 'Abrir navegación'}
            aria-controls="application-navigation"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen((open) => !open)}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-background ${focusStyles}`}
          >
            {mobileNavigationOpen
              ? <X aria-hidden="true" className="h-6 w-6" />
              : <Menu aria-hidden="true" className="h-6 w-6" />}
          </button>
          <p className="truncate text-sm font-black">Papelería Yazmín</p>
          <ThemeToggle />
        </header>

        <main id="main-content" tabIndex="-1" className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}
