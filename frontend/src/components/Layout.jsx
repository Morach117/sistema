import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Search, Users, LogOut, ArrowLeftRight, ScanBarcode, PackageOpen, MessageSquareWarning, TrendingUp, Moon, Sun, ShieldAlert, ArrowRightLeft } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  
  let user = { nombre: 'Usuario', rol: 'empleado' }
  try {
    user = JSON.parse(localStorage.getItem('user')) || user
  } catch (e) {}

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Bodega / Inventario', path: '/bodega', icon: Package, color: 'text-emerald-600 dark:text-emerald-400' },
    { name: 'Generar Traspaso', path: '/traspasos', icon: ArrowLeftRight, color: 'text-indigo-600 dark:text-indigo-400' },
    { name: 'Captura Inteligente', path: '/captura', icon: ScanBarcode, color: 'text-purple-600 dark:text-purple-400' },
    { name: 'Recepción (Activos)', path: '/recepciones', icon: PackageOpen },
    { name: 'Reclamaciones', path: '/reclamaciones', icon: MessageSquareWarning, color: 'text-red-500 dark:text-red-400' },
  ].filter(item => {
    if (user.rol === 'admin') return true;
    const modName = item.path.replace('/', '');
    return user.permisos && user.permisos.includes(modName);
  });

  const adminItems = [
    { name: 'Auditoría de Captura', path: '/auditoria', icon: ShieldAlert },
    { name: 'Auditoría Traspasos', path: '/admin-traspasos', icon: ArrowRightLeft },
    { name: 'Catálogo Maestro', path: '/catalogo', icon: Search },
    { name: 'Evolución Precios', path: '/evolucion-precios', icon: TrendingUp },
    { name: 'Gestión Usuarios', path: '/usuarios', icon: Users },
  ]

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans text-slate-300 relative">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none -z-10"></div>

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900/40 backdrop-blur-xl border-r border-slate-800/60 flex flex-col shadow-2xl z-10">
        <div className="p-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6 text-indigo-500" /> Papelería Yazmín
            </h1>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">React v4.0 Pro</p>
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-slate-800/50 text-slate-500 hover:text-slate-300 transition-colors hidden">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                  isActive 
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm shadow-indigo-500/10' 
                    : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300 border border-transparent hover:border-slate-700/50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'scale-110 transition-transform text-indigo-500' : ''}`} />
                {item.name}
              </Link>
            )
          })}

          {user.rol === 'admin' && (
            <>
              <div className="pt-8 pb-3 px-3 flex items-center gap-2">
                <div className="h-px bg-slate-800/60 flex-1"></div>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Administración</p>
                <div className="h-px bg-slate-800/60 flex-1"></div>
              </div>
              {adminItems.map((item) => {
                const isActive = location.pathname === item.path
                const Icon = item.icon
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                      isActive 
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm shadow-indigo-500/10' 
                        : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300 border border-transparent hover:border-slate-700/50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'scale-110 transition-transform text-indigo-500' : ''}`} />
                    {item.name}
                  </Link>
                )
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800/60 bg-slate-900/20">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center font-black shadow-inner">
              {user.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-200 truncate">{user.nombre}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black truncate">{user.rol}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 border border-transparent rounded-xl transition-all duration-300 active:scale-95"
          >
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-8 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
