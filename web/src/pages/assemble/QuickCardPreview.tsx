import { SearchableSelect } from '../../components/SearchableSelect'
import { Field, selectClass } from '../../components/Field'
import { SafeAreaLines } from '../../components/SafeArea'
import { useCutMm } from '../print/layout'
import { CardCanvas } from './CardCanvas'
import { useAssembledPreview, usePreviewCard } from './previewCard'

function CardSelect({ id, factionId, cardId, onCardChange }: { id?: string; factionId: number; cardId: number; onCardChange: (id: number) => void }) {
  const { combat } = usePreviewCard(factionId, cardId)
  return <SearchableSelect id={id} className={selectClass} value={cardId} onChange={e => onCardChange(Number(e.target.value))}>
    <option value={0}>Demo card</option>
    {combat.map(c => <option key={c.id} value={c.id}>{c.name} (level {c.level})</option>)}
  </SearchableSelect>
}

// The card choice on its own, one line, for a toolbar.
export function CardPicker({ factionId, cardId, onCardChange }: { factionId: number; cardId: number; onCardChange: (id: number) => void }) {
  return <label className="flex items-center gap-1.5 text-xs text-ink/70">Preview with card
    <CardSelect factionId={factionId} cardId={cardId} onCardChange={onCardChange} />
  </label>
}

// A generated image assembled with one of the faction's combat cards (its
// text, artwork and ribbon) or the demo card, to judge it as a frame.
// `picker` false leaves the card choice to the caller (CardPicker, e.g. in a toolbar), so the picture keeps its size.
export function QuickCardPreview({ imageUrl, factionId, cardId, onCardChange, picker = true }: {
  imageUrl: string; factionId: number; cardId: number; onCardChange: (id: number) => void; picker?: boolean
}) {
  const { card } = usePreviewCard(factionId, cardId)
  const { result, error } = useAssembledPreview(imageUrl, factionId, card)
  const cutMm = useCutMm()
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    {picker && <Field label="Preview with card">{id => <CardSelect id={id} factionId={factionId} cardId={cardId} onCardChange={onCardChange} />}</Field>}
    <div className="flex min-h-0 flex-1 items-center justify-center">
      {result
        ? <div className="relative inline-block h-full"><CardCanvas result={result} aria-label={`Card preview with ${card.name}`} className="block max-h-full max-w-full object-contain" style={{ height: '100%', width: 'auto' }} /><SafeAreaLines px={result.canvas} cutMm={cutMm} /></div>
        : <p role="status" className="text-sm text-ink/60">{error || 'Rendering card…'}</p>}
    </div>
  </div>
}
