import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { canAccess, defaultPathFor } from './permissions'
import { readSession, subscribeSession } from './session'

export default function ProtectedRoute({ children, module }) {
  const [session, setSession] = useState(readSession)

  useEffect(() => subscribeSession(() => setSession(readSession())), [])

  if (!session) return <Navigate to="/login" replace />
  if (module && !canAccess(session.user, module)) {
    return <Navigate to={defaultPathFor(session.user)} replace />
  }
  return children
}
