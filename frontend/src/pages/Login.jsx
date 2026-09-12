import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { saveSession } from '@/auth/session'
import { BookMarked, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await api.post('/api/auth/login', { usuario, password })
      if (res.data.success) {
        saveSession({ token: res.data.token, user: res.data.user })
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-y-auto bg-[#060b1d] px-4 py-8 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(90,99,255,0.2),transparent_30%),radial-gradient(circle_at_85%_85%,rgba(24,162,255,0.14),transparent_28%)]" />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-slate-600/70 bg-slate-950/90 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="p-6 sm:p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-indigo-400/35 bg-indigo-400/15 text-indigo-200 mb-5 shadow-inner shadow-indigo-500/20">
              <BookMarked className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-50 tracking-tight">Papelería Yazmín</h2>
            <p className="text-[11px] text-slate-300 uppercase tracking-widest font-black mt-2">Acceso al sistema</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-center gap-2 font-bold shadow-inner">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] uppercase tracking-widest font-black text-slate-300 mb-2">Usuario</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 text-slate-50 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-400/25 focus:border-indigo-300 transition-all shadow-inner font-bold placeholder:text-slate-400"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
                autoFocus
                placeholder="Ingresa tu usuario"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest font-black text-slate-300 mb-2">Contraseña</label>
              <input
                type="password"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 text-slate-50 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-400/25 focus:border-indigo-300 transition-all shadow-inner font-bold placeholder:text-slate-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" className="w-full h-12 bg-indigo-500 hover:bg-indigo-400 text-slate-950 rounded-xl shadow-lg shadow-indigo-500/25 font-black text-base mt-4 transition-colors" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>Iniciar Sesión <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
