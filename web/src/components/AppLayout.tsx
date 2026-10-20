import { Outlet, useLocation } from 'react-router'
import { Sidebar } from './Sidebar'
import { ModeNavbar } from './ModeNavbar'
import { workspaceMode } from './workspaceMode'
import { GenerationWatcher, Notices } from './Notices'

export function AppLayout() {
  const location = useLocation()
  const mode = workspaceMode(location.pathname, location.search)
  // The FAQ belongs to no mode: no section sidebar and no highlighted mode.
  const faq = location.pathname === '/faq'
  return (
    <div className="flex h-dvh flex-col">
      <ModeNavbar mode={faq ? null : mode} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {mode !== 'print' && !faq && <Sidebar mode={mode} />}
        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
      <GenerationWatcher />
      <Notices />
    </div>
  )
}
