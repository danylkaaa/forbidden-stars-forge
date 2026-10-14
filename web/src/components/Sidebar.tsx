import { useState } from 'react'
import { NavLink } from 'react-router'
import type { ComponentType } from 'react'
import { FactionsIcon, CardTypesIcon, LibraryIcon, LayersIcon, LabIcon, GalleryIcon, BatchIcon, SettingsIcon } from './icons'

import { workspaceLink, type WorkspaceMode } from './workspaceMode'

const items: { to: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { to: '/assemble', label: 'Library', Icon: LibraryIcon },
  { to: '/factions', label: 'Factions', Icon: FactionsIcon },
  { to: '/card-templates', label: 'Card Templates', Icon: LayersIcon },
  { to: '/card-types', label: 'Card Templates', Icon: CardTypesIcon },
  { to: '/faction-lab', label: 'Faction Lab', Icon: LabIcon },
  { to: '/generations', label: 'Assets', Icon: GalleryIcon },
  { to: '/batches', label: 'Batch Processing', Icon: BatchIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

// Flavour line under the nav, picked once per page load.
const LITANIES = [
  'The flesh is weak, but the machine endures.',
  'Knowledge is to be sought, hoarded and venerated.',
  'Every cog serves the Omnissiah.',
  'Iterate in draft. Sanctify in final.',
  'There is no truth in flesh, only betrayal.',
  'Measure twice, generate once.',
]

export function Sidebar({ mode }: { mode: WorkspaceMode }) {
  const visible = items.filter(item => mode === 'library'
    ? ['/assemble', '/factions', '/card-templates'].includes(item.to)
    : !['/assemble', '/card-templates'].includes(item.to))
  const [litany] = useState(() => LITANIES[Math.floor(Math.random() * LITANIES.length)])
  return (
    <aside className="relative flex w-full flex-none flex-col gap-3 border-b md:w-60 md:gap-5 md:border-r md:border-b-0 border-accent/30 bg-[linear-gradient(180deg,#2a0f0b_0%,#140a08_35%,#0b0706_100%)] p-4 shadow-[inset_-1px_0_0_rgba(0,0,0,0.6)]">
      <div className="hidden px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-phosphor/70 md:block">{mode === 'library' ? 'Library' : 'AI Image Generation'}</div>
      <nav aria-label="Sections" className="flex gap-0.5 overflow-x-auto md:flex-col">
        {visible.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={workspaceLink(to, mode)}
            className={({ isActive }) =>
              `flex shrink-0 items-center whitespace-nowrap gap-3 border-l-2 px-3 py-2 font-display text-[13px] tracking-wider no-underline transition-colors ${
                isActive
                  ? 'border-mars bg-gradient-to-r from-mars-700/60 to-transparent font-semibold text-accent-300'
                  : 'border-transparent text-ink/55 hover:border-accent/40 hover:text-ink/85'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto hidden flex-col md:flex gap-3 text-center">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-phosphor/70">&gt; Litany of the day</div>
          <p className="m-0 font-display text-[12px] italic leading-snug text-ink/55">{litany}</p>
        </div>
        <div className="hazard-stripe h-1.5 rounded-sm opacity-70" aria-hidden="true" />
      </div>
    </aside>
  )
}
