import { useState } from 'react'
import { useReferenceCards, type ReferenceCategory, type Side } from './api'
import { useReferenceOverlay } from './referenceOverlayStore'

// The reference being shown for a card type and side: the chosen one, else the first.
function useShownReference(category: ReferenceCategory, side: Side) {
  const { cards } = useReferenceCards(category, side)
  const chosen = useReferenceOverlay(s => s.chosen[`${category}:${side}`])
  return { cards, shown: cards.find(c => c.id === chosen) ?? cards[0] }
}

// Put inside a `relative` preview: draws the reference over it, centred and
// scaled by the factor the card is shown at (display width / `cardWidth`, the
// drawn card's pixels). Without `cardWidth` it fits the card's width. Never takes clicks.
export function ReferenceOverlay({ category, side, cardWidth }: { category: ReferenceCategory; side: Side; cardWidth?: number }) {
  const on = useReferenceOverlay(s => s.on), opacity = useReferenceOverlay(s => s.opacity)
  const { shown } = useShownReference(category, side)
  const [natural, setNatural] = useState(0)
  if (!on || !shown) return null
  const width = cardWidth && natural ? `${natural / cardWidth * 100}%` : '100%'
  return <img src={shown.url} alt="" aria-hidden="true" data-testid="reference-overlay" draggable={false} onLoad={e => setNatural(e.currentTarget.naturalWidth)}
    className="pointer-events-none absolute left-1/2 top-1/2 z-[5] h-auto max-w-none -translate-x-1/2 -translate-y-1/2" style={{ opacity, width }} />
}

// The switch, the reference to show and its opacity (debug aid).
export function ReferenceOverlayControls({ category, side }: { category: ReferenceCategory; side: Side }) {
  const { on, opacity, setOn, setOpacity, choose } = useReferenceOverlay()
  const { cards, shown } = useShownReference(category, side)
  return <div role="group" aria-label="Reference overlay" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
    <label className="flex items-center gap-1.5"><input type="checkbox" checked={on} disabled={!cards.length} onChange={e => setOn(e.target.checked)} className="accent-[var(--color-accent)]" />Show reference</label>
    {cards.length > 1 && <select aria-label="Reference to show" value={shown?.id} onChange={e => choose(category, side, Number(e.target.value))} className="max-w-40 rounded border border-divider bg-bg px-1.5 py-1 text-xs text-ink">
      {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
    <label className="flex items-center gap-1.5">Opacity
      <input type="range" min="0" max="100" step="1" aria-label="Reference opacity" value={Math.round(opacity * 100)} disabled={!on} onChange={e => setOpacity(Number(e.target.value) / 100)} className="w-28 accent-[var(--color-accent)]" />
      <span className="w-8 tabular-nums">{Math.round(opacity * 100)}%</span></label>
    {!cards.length && <span className="text-ink/45">No {side} reference uploaded for this card.</span>}
  </div>
}
