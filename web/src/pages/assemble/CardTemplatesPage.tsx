import { useState } from 'react'
import { CategoryTabs } from './CategoryTabs'
import { useAssembly } from './state'
import { LIBRARY_TABS } from './model'
import { CardTypeLayoutEditor } from './CardTypeLayoutEditor'
import { CardBackEditor } from './CardBackEditor'
import { FactionCardLayoutEditor } from '../faction-card/FactionCardLayoutEditor'

// Everything shared by the cards of a type, whatever their faction: where each
// part goes on the front, and the size of the frame, hexagon and logo on the back.
export default function CardTemplatesPage() {
  const category = useAssembly(s => s.category)
  const select = useAssembly(s => s.select)
  const [factionTab, setFactionTab] = useState(false)
  const label = LIBRARY_TABS.find(t => t.category === category)!.label
  return <div className="space-y-5">
    <div>
      <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Card Templates</h1>
      <p className="m-0 text-sm text-ink/60">The front and back layout of each card type.</p>
    </div>
    <CategoryTabs value={factionTab ? null : category} onChange={c => { setFactionTab(false); select({ category: c }) }} faction={{ active: factionTab, onSelect: () => setFactionTab(true) }} />
    {factionTab ? <details className="rounded-lg border border-divider bg-surface p-4" open>
      <summary className="cursor-pointer font-display text-lg text-accent-300">Faction card layout</summary>
      <div className="mt-3"><FactionCardLayoutEditor /></div>
    </details> : <>
    <details className="rounded-lg border border-divider bg-surface p-4" open>
      <summary className="cursor-pointer font-display text-lg text-accent-300">{label} front layout</summary>
      <div className="mt-3"><CardTypeLayoutEditor key={category} category={category} /></div>
    </details>
    <details className="rounded-lg border border-divider bg-surface p-4" open>
      <summary className="cursor-pointer font-display text-lg text-accent-300">{label} back layout</summary>
      <div className="mt-3"><CardBackEditor key={category} category={category} /></div>
    </details>
    </>}
  </div>
}
