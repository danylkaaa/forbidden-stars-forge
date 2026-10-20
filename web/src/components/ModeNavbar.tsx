import { Link, useLocation } from 'react-router'
import { SafeAreaToggle } from './SafeArea'
import { PreviewFactionNav } from '../pages/assemble/previewFaction'
import { CogMechanicumIcon, TestGenIcon, LibraryIcon, PrintIcon } from './icons'
import type { WorkspaceMode } from './workspaceMode'

const modes = [
  { mode: 'generation', to: '/faction-lab', label: 'AI Image Generation', Icon: TestGenIcon },
  { mode: 'library', to: '/assemble', label: 'Library', Icon: LibraryIcon },
  { mode: 'print', to: '/print', label: 'Print', Icon: PrintIcon },
] as const

export function ModeNavbar({ mode }: { mode: WorkspaceMode | null }) {
  // Card Templates previews are all drawn for one faction, picked here.
  const previews = useLocation().pathname === '/card-templates'
  return <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-accent/30 bg-surface px-4 py-1.5 sm:px-6">
    <Link to={mode === 'library' ? '/assemble' : mode === 'print' ? '/print' : '/faction-lab'} aria-label="Card Forge home" className="flex items-center gap-2 font-display text-sm font-bold tracking-widest text-accent-300 no-underline">
      <CogMechanicumIcon className="h-6 w-6 text-accent" />Card Forge
    </Link>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {previews && <PreviewFactionNav />}
      <SafeAreaToggle />
      <Link to="/faq" aria-current={mode === null ? 'page' : undefined} className={`text-xs no-underline hover:text-accent-300 ${mode === null ? 'text-accent-300' : 'text-ink/70'}`}>FAQ</Link>
    </div>
    <nav aria-label="Workspace mode" className="flex gap-1 rounded-md border border-divider bg-bg p-0.5">
      {modes.map(({ mode: value, to, label, Icon }) => <Link key={value} to={to} aria-current={mode === value ? 'page' : undefined}
        className={`inline-flex items-center gap-2 rounded px-3 py-1 text-xs font-medium no-underline transition-colors sm:text-sm ${mode === value ? 'bg-accent/15 text-accent-300 ring-1 ring-accent/50' : 'text-ink/55 hover:bg-surface hover:text-ink'}`}>
        <Icon className="hidden sm:block" />{label}
      </Link>)}
    </nav>
  </header>
}
