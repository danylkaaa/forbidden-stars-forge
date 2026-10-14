import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Category } from '../cards/model'
import { saveCardTypeLayout, useCardTypeLayouts, type CardTypeLayout } from './api'
import { assemblyLayout, framedLayers, withSubtypeLayout, type Layout } from './model'
import { PositionEditor } from './PositionEditor'
import { resolveSubtype, useSubtypes } from './subtypes'

const TEXT_LAYERS = ['name', 'upper_text', 'lower_text'] as const

// Title and rules text positions for every card of a category. The preview
// uses the level's subtype so the text can be checked against its overlays.
export function CardTypeLayoutEditor({ category }: { category: Category }) {
  const queryClient = useQueryClient()
  const layouts = useCardTypeLayouts(), subtypes = useSubtypes()
  const compose = useCallback((draft: Partial<Layout>, level: number) => {
    const subtype = resolveSubtype(subtypes.data, 0, { category, starting: level === 0 })
    return { layout: withSubtypeLayout(assemblyLayout(draft, category), subtype?.layout), overlayUrls: subtype?.overlays.map(o => o.url) ?? [] }
  }, [subtypes.data, category])
  if (layouts.isPending || subtypes.isPending) return <p role="status" className="text-sm text-ink/60">Loading layout…</p>
  if (layouts.isError) return <p role="alert" className="text-sm text-danger">{layouts.error.message}</p>
  const { back, ...saved } = layouts.data.find(l => l.category === category)?.layout ?? {}
  return <PositionEditor id={`card-type-${category}`} category={category} label={`${category} card type`} saved={saved} initialLevel={2}
    layersFor={() => category === 'combat' ? [...TEXT_LAYERS] : [...framedLayers(category)]} compose={compose} resetLabel="Reset to reference layout"
    note={category === 'upgrade'
      ? 'Positions apply to every upgrade card: title, level, resource price, the order’s hexagon, faction logo and the rules text. Text is always left aligned.'
      : category === 'schema'
      ? 'Positions apply to every event card: title, the scheme / tactic label, the action dial, faction logo and description.'
      : 'Title and rules text positions apply to every card of this type. Text is always left aligned; rules text centres itself in its panel unless you turn that off.'}
    onSave={async draft => { const saved = await saveCardTypeLayout(category, back ? { ...draft, back } : draft); queryClient.setQueryData<CardTypeLayout[]>(['card-type-layouts'], old => [...(old ?? []).filter(l => l.category !== category), saved]) }} />
}
