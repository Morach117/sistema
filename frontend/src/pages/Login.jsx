import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
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
      const res = await axios.post('/api/auth/login', { usuario, password })
      if (res.data.success) {
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('user', JSON.stringify(res.data.user))
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm glass-panel bg-slate-900/60 rounded-3xl shadow-2xl border border-slate-800/60 overflow-hidden relative z-10 backdrop-blur-xl">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-6 shadow-inner">
              <BookMarked className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-100 tracking-tight">Papelería Yazmín</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-2">Sistema React Premium</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-center gap-2 font-bold shadow-inner">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Usuario</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 text-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner font-bold placeholder:text-slate-600"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
                autoFocus
                placeholder="Ingresa tu usuario"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Contraseña</label>
              <input
                type="password"
                className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 text-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner font-bold placeholder:text-slate-600"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 font-black text-base mt-4 transition-all active:scale-95" disabled={loading}>
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
