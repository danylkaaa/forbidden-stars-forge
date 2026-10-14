import { useEffect, useRef, useState } from 'react'
import type { Faction } from '../factions/api'
import { LABELS, type CardInput } from './model'

function Check({ checked, partial, label, onChange }: { checked: boolean; partial?: boolean; label: string; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!partial && !checked }, [partial, checked])
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={e => onChange(e.target.checked)} className="accent-[var(--color-accent)]" />
}

const cardInfo = (c: CardInput) => c.category === 'combat' ? (c.starting ? 'starting' : `level ${c.level}`) : c.category === 'upgrade' ? `level ${c.level}` : ''

// The cards of an import file grouped by faction: tick the factions and cards
// to import. `selected` holds indices into `cards`.
export function ImportTree({ cards, factions, selected, onChange }: { cards: CardInput[]; factions: Faction[]; selected: ReadonlySet<number>; onChange: (next: Set<number>) => void }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const groups = new Map<number, number[]>()
  cards.forEach((c, i) => groups.set(c.faction_id, [...(groups.get(c.faction_id) ?? []), i]))
  const set = (indices: number[], on: boolean) => { const next = new Set(selected); for (const i of indices) { if (on) next.add(i); else next.delete(i) }; onChange(next) }
  const toggleOpen = (id: number) => setOpen(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next })
  const all = cards.map((_, i) => i)
  return <section aria-label="Import preview" className="rounded border border-divider p-3">
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="m-0 text-sm">Preview: {selected.size} of {cards.length} cards selected</h3>
      <label className="flex items-center gap-1.5 text-xs"><Check label="Select all cards" checked={selected.size === cards.length} partial={selected.size > 0} onChange={on => set(all, on)} />All</label>
      <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline" onClick={() => setOpen(open.size ? new Set() : new Set(groups.keys()))}>{open.size ? 'Collapse all' : 'Expand all'}</button>
    </div>
    <ul role="tree" aria-label="Cards to import" className="m-0 mt-2 max-h-72 list-none overflow-auto p-0">
      {[...groups].map(([factionId, indices]) => {
        const name = factions.find(f => f.id === factionId)?.name ?? `Faction ${factionId}`
        const count = indices.filter(i => selected.has(i)).length, expanded = open.has(factionId)
        return <li key={factionId} role="treeitem" aria-expanded={expanded} aria-selected={count === indices.length} className="my-0.5">
          <div className="flex items-center gap-2 text-sm">
            <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`} onClick={() => toggleOpen(factionId)} className="w-5 cursor-pointer border-0 bg-transparent p-0 text-ink/60">{expanded ? '▾' : '▸'}</button>
            <Check label={`Select ${name}`} checked={count === indices.length} partial={count > 0} onChange={on => set(indices, on)} />
            <span className="font-medium">{name}</span>
            <span className="text-xs text-ink/50">{count} / {indices.length}</span>
          </div>
          {expanded && <ul role="group" className="m-0 ml-7 list-none p-0">
            {indices.map(i => <li key={i} role="treeitem" aria-selected={selected.has(i)} className="my-0.5">
              <label className="flex items-center gap-2 text-sm">
                <Check label={`Select ${cards[i].name}`} checked={selected.has(i)} onChange={on => set([i], on)} />
                <span>{cards[i].name}</span>
                <span className="text-xs text-ink/50">{LABELS[cards[i].category]}{cardInfo(cards[i]) && ` · ${cardInfo(cards[i])}`}</span>
              </label>
            </li>)}
          </ul>}
        </li>
      })}
    </ul>
    <p className="mb-0 mt-2 text-xs text-ink/60">Selected cards are saved together. A validation failure saves none.</p>
  </section>
}
