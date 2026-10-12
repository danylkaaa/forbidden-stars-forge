import { Field, selectClass } from '../../components/Field'
import { CardCanvas } from './CardCanvas'
import { useAssembledPreview, usePreviewCard } from './previewCard'

// A generated image assembled with one of the faction's combat cards (its
// text, artwork and level subtype) or the demo card, to judge it as a frame.
export function QuickCardPreview({ imageUrl, factionId, cardId, onCardChange }: {
  imageUrl: string; factionId: number; cardId: number; onCardChange: (id: number) => void
}) {
  const { card, combat } = usePreviewCard(factionId, cardId)
  const { result, error } = useAssembledPreview(imageUrl, factionId, card)
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <Field label="Preview with card">{id => <select id={id} className={selectClass} value={card.id} onChange={e => onCardChange(Number(e.target.value))}>
      <option value={0}>Demo card</option>
      {combat.map(c => <option key={c.id} value={c.id}>{c.name} (level {c.level})</option>)}
    </select>}</Field>
    <div className="flex min-h-0 flex-1 items-center justify-center">
      {result
        ? <CardCanvas result={result} aria-label={`Card preview with ${card.name}`} className="block max-h-full max-w-full object-contain" style={{ height: '100%', width: 'auto' }} />
        : <p role="status" className="text-sm text-ink/60">{error || 'Rendering card…'}</p>}
    </div>
  </div>
}
