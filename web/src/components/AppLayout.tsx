import { Outlet, useLocation } from 'react-router'
import { Sidebar } from './Sidebar'
import { ModeNavbar } from './ModeNavbar'
import { workspaceMode } from './workspaceMode'

export function AppLayout() {
  const location = useLocation()
  const mode = workspaceMode(location.pathname, location.search)
  return (
    <div className="flex h-dvh flex-col">
      <ModeNavbar mode={mode} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {mode !== 'print' && <Sidebar mode={mode} />}
        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
