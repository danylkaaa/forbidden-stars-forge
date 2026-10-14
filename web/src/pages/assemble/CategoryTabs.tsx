import type { Category } from '../cards/model'
import { LIBRARY_TABS } from './model'

const tabClass = (active: boolean) => `-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-4 py-2 text-sm font-medium ${active ? 'border-accent text-accent' : 'border-transparent text-ink/60 hover:text-ink'}`

// `faction` adds the library's Faction card tab after the card types; `value`
// is null while it is the open one.
export function CategoryTabs({ value, onChange, badges, faction }: { value: Category | null; onChange: (c: Category) => void; badges?: Record<string, string | number>; faction?: { active: boolean; onSelect: () => void } }) {
  return <div role="tablist" aria-label="Card type" className="flex gap-1 border-b border-divider">
    {LIBRARY_TABS.map(({ category, label }) => <button key={category} type="button" role="tab" aria-selected={value === category} onClick={() => onChange(category)} className={tabClass(value === category)}>
      {label}{badges && <span className="ml-1.5 text-xs text-ink/45">{badges[category]}</span>}
    </button>)}
    {faction && <button type="button" role="tab" aria-selected={faction.active} onClick={faction.onSelect} className={tabClass(faction.active)}>Faction card</button>}
  </div>
}
