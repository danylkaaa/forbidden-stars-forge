import { useQueryClient } from '@tanstack/react-query'
import type { Category } from '../cards/model'
import { saveCardTypeLayout, useCardTypeLayouts, type CardTypeLayout } from './api'
import { framedLayers, type Layer } from './model'
import { PositionEditor } from './PositionEditor'

// Starting cards show the faction logo where other cards have a level and a price, on the ribbon's plate or badge.
const COMBAT_LAYERS = (starting: boolean): Layer[] => starting
  ? ['name', 'logo', 'resources', 'upper_text', 'lower_text']
  : ['name', 'level_icon', 'level', 'cost_icon', 'resource_cost', 'resources', 'upper_text', 'lower_text']

// Title and rules text positions for every card of a category. The preview
// shows the ribbon of the chosen card kind (starting or leveled).
export function CardTypeLayoutEditor({ category }: { category: Category }) {
  const queryClient = useQueryClient()
  const layouts = useCardTypeLayouts()
  if (layouts.isPending) return <p role="status" className="text-sm text-ink/60">Loading layout…</p>
  if (layouts.isError) return <p role="alert" className="text-sm text-danger">{layouts.error.message}</p>
  const { back, ...saved } = layouts.data.find(l => l.category === category)?.layout ?? {}
  return <PositionEditor id={`card-type-${category}`} category={category} label={`${category} card type`} saved={saved} initialLevel={2}
    layersFor={(_level, starting) => category === 'combat' ? COMBAT_LAYERS(starting) : [...framedLayers(category)]} resetLabel="Reset to reference layout"
    note={category === 'upgrade'
      ? 'Positions apply to every upgrade card: title, level, resource price, the order’s hexagon, faction logo and the rules text. Text is always left aligned.'
      : category === 'schema'
      ? 'Positions apply to every event card: title, the scheme / tactic label, the action dial, faction logo and description.'
      : 'Positions apply to every combat card: title, rules text, the level and price with their icons, the resource column and, on starting cards, the faction logo. Switch the card kind (Advanced or Starting) to see each ribbon.'}
    onSave={async draft => { const saved = await saveCardTypeLayout(category, back ? { ...draft, back } : draft); queryClient.setQueryData<CardTypeLayout[]>(['card-type-layouts'], old => [...(old ?? []).filter(l => l.category !== category), saved]) }} />
}
