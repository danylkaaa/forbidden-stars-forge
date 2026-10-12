import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { OVERLAY_LAYERS, withSubtypeLayout, type Layout } from './model'
import { PositionEditor } from './PositionEditor'
import { saveSubtypeLayout, type Subtype } from './subtypes'

// Positions resources, the level badge and the faction logo on this
// subtype's overlays. Level 0 cards have a logo instead of a level and price.
export function SubtypeLayoutEditor({ subtype }: { subtype: Subtype }) {
  const queryClient = useQueryClient()
  const compose = useCallback((draft: Partial<Layout>, _level: number, base: Layout) =>
    ({ layout: withSubtypeLayout(base, draft), overlayUrls: subtype.overlays.map(o => o.url) }), [subtype.overlays])
  return <PositionEditor id={`subtype-${subtype.id}`} label={subtype.name} saved={subtype.layout} initialLevel={subtype.name === 'Level 1+' ? 2 : 0}
    layersFor={level => OVERLAY_LAYERS.filter(key => level === 0 ? key !== 'resource_cost' && key !== 'level' : key !== 'logo')}
    compose={compose} resetLabel="Reset to card type layout"
    note="These positions apply to every card using this subtype. Title and rules text are positioned in the card type layout."
    onSave={async draft => { const saved = await saveSubtypeLayout(subtype.id, draft); queryClient.setQueryData<Subtype[]>(['subtypes'], old => old?.map(s => s.id === saved.id ? saved : s)) }} />
}
