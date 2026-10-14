import { useMemo } from 'react'
import { useCardTypes, type CardType } from '../card-types/api'
import { useGenerations, generationImageUrl } from '../test-generation/api'
import { useDoneBatchItems } from '../generations/api'
import { batchItemImageUrl } from '../batches/api'
import type { Category } from '../cards/model'
import { useAssemblyTemplates, useCardTypeLayouts, type Side } from './api'
import { LIBRARY_TABS, assemblyLayout } from './model'
import type { ImageRef } from '../../lib/favorites'

// A finished generated image (Faction Lab or batch) usable as a card template.
export type LibraryImage = { key: string; name: string; factionId: number; cardTypeId: number; url: string; createdAt: string; source: 'Lab' | 'Batch'; favorite: boolean; generationId?: number; logoUrl?: string; logoScale?: number; ref: ImageRef }

export function useLibraryImages() {
  const generations = useGenerations(), batches = useDoneBatchItems()
  const data = useMemo(() => [
    ...(generations.data ?? []).flatMap<LibraryImage>(g => { const url = generationImageUrl(g); return url ? [{ key: `test-${g.id}`, name: g.name || `Generation #${g.id}`, factionId: g.faction_id, cardTypeId: g.card_type_id, url, createdAt: g.created_at, source: 'Lab', favorite: g.favorite, generationId: g.id, ref: { kind: 'generation', id: g.id } }] : [] }),
    ...(batches.data ?? []).flatMap<LibraryImage>(b => { const url = batchItemImageUrl(b.batch_id, b); return url ? [{ key: `batch-${b.id}`, name: b.name || `Batch image #${b.id}`, factionId: b.faction_id, cardTypeId: b.card_type_id, url, createdAt: b.completed_at, source: 'Batch', favorite: b.favorite, ref: { kind: 'batch-item', batchId: b.batch_id, itemId: b.id } }] : [] }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [generations.data, batches.data])
  return { data, queries: [generations, batches], isPending: generations.isPending || batches.isPending }
}

// Card types whose name suggests the category come first in the picker.
// Back card types are named "<type> back" (built in on the server).
export function matchesCategory(type: CardType | undefined, category: Category, side: Side = 'front') {
  const name = type?.name.toLowerCase() ?? ''
  return name.endsWith(' back') === (side === 'back') && LIBRARY_TABS.find(t => t.category === category)!.keywords.some(k => name.includes(k))
}
export const backTypeName = (category: Category) => `${{ combat: 'combat', schema: 'events', upgrade: 'upgrade' }[category]} back`

// Faction Lab opens on the template's faction and card type, with the
// generation itself selected so it can be area-edited.
export function labLink(image: LibraryImage) {
  const params = new URLSearchParams({ faction: String(image.factionId), card_type: String(image.cardTypeId) })
  if (image.generationId) params.set('generation', String(image.generationId))
  return `/faction-lab?${params}`
}

// The category's text layout (edited on the Card Types page). Overlays come
// only from subtypes, so a template image needs nothing else.
export function useTemplateLayout(category: Category = 'combat') {
  const layouts = useCardTypeLayouts()
  const saved = layouts.data?.find(l => l.category === category)?.layout
  const layout = useMemo(() => assemblyLayout(saved ?? {}, category), [saved, category])
  return { layout, ready: !layouts.isPending, error: layouts.error }
}

// The template chosen for a faction and category, if it still exists.
export function useTemplate(factionId: number | null, category: Category, side: Side = 'front') {
  const templates = useAssemblyTemplates(), images = useLibraryImages()
  const saved = templates.data?.find(t => t.faction_id === factionId && t.category === category && (t.side ?? 'front') === side)
  const key = saved?.image_key
  const source = key ? images.data.find(i => i.key === key) : undefined
  const image = useMemo(() => source && side === 'back' ? { ...source, logoUrl: saved?.logo_url, logoScale: saved?.logo_scale } : source, [source, side, saved?.logo_url, saved?.logo_scale])
  return { key, image, isPending: templates.isPending || images.isPending, queries: [templates, ...images.queries] }
}

// For layout previews: the chosen template, else the faction's newest image
// of a matching card type, else its newest image at all.
export function usePreviewTemplate(factionId: number | null, category: Category) {
  const template = useTemplate(factionId, category), images = useLibraryImages(), types = useCardTypes()
  const own = images.data.filter(i => i.factionId === factionId)
  const fallback = own.find(i => matchesCategory(types.data?.find(t => t.id === i.cardTypeId), category)) ?? own[0]
  return { image: template.image ?? fallback, chosen: !!template.image, isPending: template.isPending || types.isPending }
}
