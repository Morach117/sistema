import { Outlet } from 'react-router-dom'
import AppShell from './layout/AppShell'

export default function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
