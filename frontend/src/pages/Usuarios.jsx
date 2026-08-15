import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, UserPlus, Trash2, Edit2, ShieldAlert, Check } from 'lucide-react'
import Swal from 'sweetalert2'

export default function Usuarios() {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({ id: null, nombre: '', usuario: '', password: '', rol: 'empleado', permisos: [] })

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const res = await axios.get('/api/usuarios/listar')
      return res.data
    }
  })

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ['auditoria_logs'],
    queryFn: async () => {
      const res = await axios.get('/api/usuarios/logs')
      return res.data
    }
  })

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      await axios.post('/api/usuarios/guardar', data);
      if (data.id && data.rol === 'empleado') {
          await axios.post('/api/usuarios/permisos/guardar', { usuario_id: data.id, modulos: data.permisos });
      } else if (!data.id && data.rol === 'empleado') {
          // New user doesn't have ID yet in formData, we'd need it to save permissions. 
          // For a robust system, backend should handle permissions inside /guardar, but we can refactor slightly.
          // Wait, the API `/api/usuarios/guardar` does not return the inserted ID currently. 
          // Let's modify backend to return ID or handle permissions here.
          // Actually, let's just make it a separate step or modify backend to accept 'permisos' array.
      }
      return data;
    },
    onSuccess: () => {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Usuario guardado', showConfirmButton: false, timer: 1500 })
      queryClient.invalidateQueries(['usuarios'])
      queryClient.invalidateQueries(['auditoria_logs'])
      resetForm()
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Error al guardar', 'error')
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => axios.post('/api/usuarios/eliminar', { id }),
    onSuccess: () => {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Usuario eliminado', showConfirmButton: false, timer: 1500 })
      queryClient.invalidateQueries(['usuarios'])
      queryClient.invalidateQueries(['auditoria_logs'])
    },
    onError: (err) => Swal.fire('Error', err.response?.data?.error || 'Error al eliminar', 'error')
  })

  const resetForm = () => {
    setIsEditing(false)
    setFormData({ id: null, nombre: '', usuario: '', password: '', rol: 'empleado', permisos: [] })
  }

  const handleEdit = async (user) => {
    let userPerms = [];
    if (user.rol === 'empleado') {
      try {
        const res = await axios.get(`/api/usuarios/permisos/${user.id}`);
        userPerms = res.data.permisos || [];
      } catch (e) {
        console.error("Error fetching permissions", e);
      }
    }
    setFormData({ id: user.id, nombre: user.nombre, usuario: user.usuario, password: '', rol: user.rol, permisos: userPerms })
    setIsEditing(true)
  }

  const handleDelete = (id) => {
    Swal.fire({
      title: '¿Eliminar usuario?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Eliminar'
    }).then((res) => {
      if (res.isConfirmed) deleteMutation.mutate(id)
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    saveMutation.mutate(formData)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-10">
      
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-100">Usuarios y Accesos</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5 ml-1">Administración y Auditoría</p>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold gap-2">
            <UserPlus className="w-4 h-4" /> Nuevo Usuario
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda: Formulario (si aplica) o Logs */}
        <div className="lg:col-span-1 space-y-6">
          {isEditing ? (
            <Card className="glass-panel border-indigo-500/50 bg-slate-900/60 shadow-lg shadow-indigo-500/10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-black text-slate-100 flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-indigo-400" />
                  {formData.id ? 'Editar Usuario' : 'Nuevo Usuario'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre Completo</label>
                    <input type="text" required className="w-full mt-1 bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuario (Login)</label>
                    <input type="text" required className="w-full mt-1 bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.usuario} onChange={e => setFormData({...formData, usuario: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Contraseña {formData.id && <span className="text-amber-500 normal-case font-medium">(Dejar en blanco para no cambiar)</span>}
                    </label>
                    <input type="password" required={!formData.id} className="w-full mt-1 bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rol del Sistema</label>
                    <select className="w-full mt-1 bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})}>
                      <option value="empleado">Empleado (Operativo)</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  
                  {formData.rol === 'empleado' && formData.id && (
                    <div className="pt-2 border-t border-slate-700/50">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Módulos Permitidos</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['dashboard', 'bodega', 'traspasos', 'captura', 'recepciones', 'reclamaciones'].map(mod => (
                          <label key={mod} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input type="checkbox" className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                              checked={formData.permisos.includes(mod)}
                              onChange={(e) => {
                                const newPerms = e.target.checked 
                                  ? [...formData.permisos, mod] 
                                  : formData.permisos.filter(p => p !== mod);
                                setFormData({...formData, permisos: newPerms})
                              }} />
                            <span className="capitalize">{mod === 'dashboard' ? 'Dashboard' : mod === 'bodega' ? 'Bodega' : mod === 'traspasos' ? 'Traspasos' : mod === 'captura' ? 'Captura' : mod === 'recepciones' ? 'Recepciones' : 'Reclamaciones'}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[9px] text-slate-500 mt-2">* Para editar permisos de un usuario nuevo, primero guárdalo y luego dale clic en editar.</p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="outline" className="flex-1 border-slate-700 text-slate-300" onClick={resetForm}>Cancelar</Button>
                    <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white" disabled={saveMutation.isPending}>
                      <Check className="w-4 h-4 mr-2" /> Guardar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-panel border-slate-800/60 bg-slate-900/40">
              <CardHeader className="pb-3 border-b border-slate-800/60 bg-slate-950/30">
                <CardTitle className="text-sm font-black text-slate-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-400" /> Registro de Auditoría
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[400px] overflow-y-auto custom-scrollbar p-4 space-y-3">
                  {loadingLogs ? (
                    <div className="text-center py-10"><span className="loading loading-spinner text-purple-500"></span></div>
                  ) : logs?.length === 0 ? (
                    <div className="text-center text-slate-500 text-xs font-bold py-10">Sin registros recientes</div>
                  ) : (
                    logs?.map(log => (
                      <div key={log.id} className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/60">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">{log.accion}</span>
                          <span className="text-[9px] font-bold text-slate-500">{new Date(log.fecha).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium mb-1">{log.detalle}</p>
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">👤 {log.autor}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Columna Derecha: Tabla de Usuarios */}
        <div className="lg:col-span-2">
          <Card className="glass-panel border-slate-800/60 bg-slate-900/40 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/80 border-b border-slate-800/60 text-slate-500 text-[10px] uppercase font-black tracking-widest sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Detalles</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {isLoading ? (
                    <tr><td colSpan="4" className="text-center py-10"><span className="loading loading-spinner text-indigo-500"></span></td></tr>
                  ) : usuarios?.length > 0 ? (
                    usuarios.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-black text-slate-200 text-base">{u.usuario}</div>
                          <div className="text-xs font-bold text-slate-500">{u.nombre}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${u.activo ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                           <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${u.rol === 'admin' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                            {u.rol}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20" onClick={() => handleEdit(u)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => handleDelete(u.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="4" className="text-center py-10 text-slate-500 font-bold">No se encontraron usuarios.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}
