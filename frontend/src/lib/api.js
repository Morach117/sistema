import axios from 'axios'
import { clearSession, readSession } from '../auth/session'

const api = axios.create()

api.interceptors.request.use((config) => {
  const session = readSession()
  if (session) config.headers.Authorization = `Bearer ${session.token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) clearSession()
    return Promise.reject(error)
  },
)

export default api
