import type { Category } from '../cards/model'
import { LIBRARY_TABS } from './model'

export function CategoryTabs({ value, onChange, badges }: { value: Category; onChange: (c: Category) => void; badges?: Record<string, string | number> }) {
  return <div role="tablist" aria-label="Card type" className="flex gap-1 border-b border-divider">
    {LIBRARY_TABS.map(({ category, label }) => <button key={category} type="button" role="tab" aria-selected={value === category} onClick={() => onChange(category)}
      className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-4 py-2 text-sm font-medium ${value === category ? 'border-accent text-accent' : 'border-transparent text-ink/60 hover:text-ink'}`}>
      {label}{badges && <span className="ml-1.5 text-xs text-ink/45">{badges[category]}</span>}
    </button>)}
  </div>
}
