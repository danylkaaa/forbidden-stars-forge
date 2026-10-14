import { SearchableSelect } from '../../components/SearchableSelect'
import { Field, selectClass } from '../../components/Field'
import { SafeAreaLines, SafeAreaToggle } from '../../components/SafeArea'
import { useCutMm } from '../print/layout'
import { CardCanvas } from './CardCanvas'
import { useAssembledPreview, usePreviewCard } from './previewCard'

// A generated image assembled with one of the faction's combat cards (its
// text, artwork and level subtype) or the demo card, to judge it as a frame.
export function QuickCardPreview({ imageUrl, factionId, cardId, onCardChange }: {
  imageUrl: string; factionId: number; cardId: number; onCardChange: (id: number) => void
}) {
  const { card, combat } = usePreviewCard(factionId, cardId)
  const { result, error } = useAssembledPreview(imageUrl, factionId, card)
  const cutMm = useCutMm()
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <SafeAreaToggle />
    <Field label="Preview with card">{id => <SearchableSelect id={id} className={selectClass} value={card.id} onChange={e => onCardChange(Number(e.target.value))}>
      <option value={0}>Demo card</option>
      {combat.map(c => <option key={c.id} value={c.id}>{c.name} (level {c.level})</option>)}
    </SearchableSelect>}</Field>
    <div className="flex min-h-0 flex-1 items-center justify-center">
      {result
        ? <div className="relative inline-block h-full"><CardCanvas result={result} aria-label={`Card preview with ${card.name}`} className="block max-h-full max-w-full object-contain" style={{ height: '100%', width: 'auto' }} /><SafeAreaLines px={result.canvas} cutMm={cutMm} /></div>
        : <p role="status" className="text-sm text-ink/60">{error || 'Rendering card…'}</p>}
    </div>
  </div>
}
