import { Link } from 'react-router'
import { CogMechanicumIcon, TestGenIcon, CardTypesIcon } from './icons'
import type { WorkspaceMode } from './workspaceMode'

const modes = [
  { mode: 'generation', to: '/faction-lab', label: 'AI Image Generation', Icon: TestGenIcon },
  { mode: 'library', to: '/assemble', label: 'Assemble Library', Icon: CardTypesIcon },
] as const

export function ModeNavbar({ mode }: { mode: WorkspaceMode }) {
  return <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-accent/30 bg-surface px-4 py-3 sm:px-6">
    <Link to={mode === 'library' ? '/assemble' : '/faction-lab'} aria-label="Card Forge home" className="flex items-center gap-2.5 font-display text-sm font-bold tracking-widest text-accent-300 no-underline">
      <CogMechanicumIcon className="h-8 w-8 text-accent" />Card Forge
    </Link>
    <nav aria-label="Workspace mode" className="flex gap-1 rounded-md border border-divider bg-bg p-1">
      {modes.map(({ mode: value, to, label, Icon }) => <Link key={value} to={to} aria-current={mode === value ? 'page' : undefined}
        className={`inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-medium no-underline transition-colors sm:text-sm ${mode === value ? 'bg-accent/15 text-accent-300 ring-1 ring-accent/50' : 'text-ink/55 hover:bg-surface hover:text-ink'}`}>
        <Icon className="hidden sm:block" />{label}
      </Link>)}
    </nav>
  </header>
}
