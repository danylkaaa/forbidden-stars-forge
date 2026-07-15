import { NavLink } from 'react-router'
import type { ComponentType } from 'react'
import { FactionsIcon, CardTypesIcon, TestGenIcon, BatchIcon, SettingsIcon } from './icons'

const items: { to: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { to: '/factions', label: 'Factions', Icon: FactionsIcon },
  { to: '/card-types', label: 'Card Types', Icon: CardTypesIcon },
  { to: '/test-generation', label: 'Test Generation', Icon: TestGenIcon },
  { to: '/batches', label: 'Batch Processing', Icon: BatchIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

export function Sidebar() {
  return (
    <aside className="w-60 flex-none flex flex-col gap-5 p-4 border-r border-divider">
      <div className="flex items-center gap-2 px-1 pt-1 pb-2">
        <div className="w-7 h-7 rounded-md border-[1.5px] border-accent flex-none" />
        <div>
          <div className="font-medium text-base tracking-tight">Card Forge</div>
          <div className="text-[10px] tracking-widest uppercase text-ink/50">local · offline</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm no-underline ${
                isActive ? 'text-accent-300 bg-accent-900 font-medium' : 'text-ink/50 hover:text-ink/80'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
