import { useState } from 'react'
import { NavLink } from 'react-router'
import type { ComponentType } from 'react'
import { FactionsIcon, CardTypesIcon, LabIcon, TestGenIcon, GalleryIcon, BatchIcon, SettingsIcon, CogMechanicumIcon } from './icons'

const items: { to: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { to: '/factions', label: 'Factions', Icon: FactionsIcon },
  { to: '/card-types', label: 'Card Types', Icon: CardTypesIcon },
  { to: '/faction-lab', label: 'Faction Lab', Icon: LabIcon },
  { to: '/test-generation', label: 'Test Generation', Icon: TestGenIcon },
  { to: '/generations', label: 'Generations', Icon: GalleryIcon },
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

export function Sidebar() {
  const [litany] = useState(() => LITANIES[Math.floor(Math.random() * LITANIES.length)])
  return (
    <aside className="relative flex w-60 flex-none flex-col gap-5 border-r border-accent/30 bg-[linear-gradient(180deg,#2a0f0b_0%,#140a08_35%,#0b0706_100%)] p-4 shadow-[inset_-1px_0_0_rgba(0,0,0,0.6)]">
      <div className="flex flex-col items-center gap-1.5 border-b border-accent/25 px-1 pt-2 pb-4 text-center">
        <CogMechanicumIcon className="h-14 w-14 text-accent drop-shadow-[0_0_10px_rgba(208,139,62,0.35)]" />
        <div className="font-display text-[17px] font-bold uppercase tracking-[0.18em] text-accent-300">Card Forge</div>
        <div className="font-mono text-[9.5px] tracking-[0.2em] text-phosphor/70" title="FORGE in binary">01000110 01001111</div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 border-l-2 px-3 py-2 font-display text-[13px] tracking-wider no-underline transition-colors ${
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
      <div className="mt-auto flex flex-col gap-3 text-center">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-phosphor/70">&gt; Litany of the day</div>
          <p className="m-0 font-display text-[12px] italic leading-snug text-ink/55">{litany}</p>
        </div>
        <div className="hazard-stripe h-1.5 rounded-sm opacity-70" aria-hidden="true" />
      </div>
    </aside>
  )
}
