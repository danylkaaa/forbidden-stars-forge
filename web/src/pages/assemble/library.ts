import { useEffect, useMemo, useState } from 'react'
import { useCardTypes, type CardType } from '../card-types/api'
import { useGenerations, generationImageUrl } from '../test-generation/api'
import { useDoneBatchItems } from '../generations/api'
import { batchItemImageUrl } from '../batches/api'
import type { Category } from '../cards/model'
import { useFactions } from '../factions/api'
import { useFactionLogos } from './logos'
import { nebulaTemplateUrl } from './backDecor'
import { UPGRADE_BACK_KEY, UPGRADE_FRONT_KEY, upgradeBackUrl, upgradeFrontUrl } from './upgradeBack'
import { useAssemblyTemplates, useBackLogoScale, useCardTypeLayouts, useFactionBanner, useDrawnNebula, useFactionColor, useNebulaPicture, type Side } from './api'
import { LIBRARY_TABS, assemblyLayout } from './model'
import type { ImageRef } from '../../lib/favorites'

// A finished generated image (Faction Lab or batch) usable as a card template.
export type LibraryImage = { key: string; name: string; factionId: number; cardTypeId: number; url: string; createdAt: string; source: 'Lab' | 'Batch'; favorite: boolean; generationId?: number; logoUrl?: string; logoScale?: number; elementUrl?: string; ref: ImageRef }

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
  // The card back serves combat and event cards; the upgrade back is bundled, and its element is not a card.
  if (side === 'back') return name === 'card back' && category !== 'upgrade'
  return name !== 'upgrade element' && !name.endsWith(' back') && LIBRARY_TABS.find(t => t.category === category)!.keywords.some(k => name.includes(k))
}
// The card type backs (and for upgrades, the top/bottom element) are generated with.
export const backTypeName = (category: Category) => category === 'upgrade' ? 'upgrade element' : 'card back'

// Faction Lab opens on the template's faction and card type, with the
// generation itself selected so it can be area-edited.
export function labLink(image: LibraryImage) {
  const params = new URLSearchParams({ faction: String(image.factionId), card_type: String(image.cardTypeId) })
  if (image.generationId) params.set('generation', String(image.generationId))
  return `/faction-lab?${params}`
}

// The category's text layout (edited on the Card Types page). Overlays come
// from the bundled ribbons, so a template image needs nothing else.
export function useTemplateLayout(category: Category = 'combat') {
  const layouts = useCardTypeLayouts()
  const saved = layouts.data?.find(l => l.category === category)?.layout
  const layout = useMemo(() => assemblyLayout(saved ?? {}, category), [saved, category])
  return { layout, ready: !layouts.isPending, error: layouts.error }
}

// The faction's nebula as a template image, when it is switched on.
function useNebulaTemplate(factionId: number | null, enabled: boolean) {
  const nebula = useDrawnNebula(factionId ?? undefined), factions = useFactions(), picture = useNebulaPicture('combat')
  const factionColor = useFactionColor(factionId), fallback = factionColor || (factions.data?.find(f => f.id === factionId)?.primary_color ?? '')
  const active = enabled && !!factionId && nebula.as_template
  const [made, setMade] = useState<{ key: string; url: string } | null>(null)
  const key = `${factionId}|${nebula.color}|${nebula.seed}|${nebula.density}|${fallback}|${picture}`
  useEffect(() => {
    if (!active) return
    let cancelled = false
    nebulaTemplateUrl(nebula, fallback, undefined, picture).then(url => { if (!cancelled) setMade({ key, url }) }).catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])
  const url = active && made?.key === key ? made.url : undefined
  const image = useMemo<LibraryImage | undefined>(() => url && factionId ? { key: 'nebula', name: 'Nebula', factionId, cardTypeId: 0, url, createdAt: '', source: 'Lab', favorite: false, ref: { kind: 'generation', id: 0 } } : undefined, [url, factionId])
  return { image, pending: active && !url }
}

const BUNDLED_UPGRADE_BACK: LibraryImage = { key: UPGRADE_BACK_KEY, name: 'Upgrade back', factionId: 0, cardTypeId: 0, url: upgradeBackUrl, createdAt: '', source: 'Lab', favorite: false, ref: { kind: 'generation', id: 0 } }

export const UPGRADE_FRONT_IMAGE: LibraryImage = { key: UPGRADE_FRONT_KEY, name: 'Upgrade front', factionId: 0, cardTypeId: 0, url: upgradeFrontUrl, createdAt: '', source: 'Lab', favorite: false, ref: { kind: 'generation', id: 0 } }

// The template chosen for a faction and category, if it still exists. With
// none chosen, the faction's nebula stands in when it is switched on.
export function useTemplate(factionId: number | null, category: Category, side: Side = 'front') {
  const templates = useAssemblyTemplates(), images = useLibraryImages(), logos = useFactionLogos(), eventLogoScale = useBackLogoScale(factionId, category), banner = useFactionBanner(factionId)
  const logo = logos.data?.find(l => l.faction_id === factionId)?.url
  // Combat and event backs share one image; the upgrade back is the bundled
  // texture for every faction.
  const imageCategory = side === 'back' && category === 'schema' ? 'combat' : category
  const saved = templates.data?.find(t => t.faction_id === factionId && t.category === category && (t.side ?? 'front') === side)
  // Upgrade cards use bundled pictures, the same for every faction.
  const key = category === 'upgrade' ? (side === 'back' ? UPGRADE_BACK_KEY : UPGRADE_FRONT_KEY) : templates.data?.find(t => t.faction_id === factionId && t.category === imageCategory && (t.side ?? 'front') === side)?.image_key
  const source = key === UPGRADE_BACK_KEY ? BUNDLED_UPGRADE_BACK : key === UPGRADE_FRONT_KEY ? UPGRADE_FRONT_IMAGE : key ? images.data.find(i => i.key === key) : undefined
  const nebula = useNebulaTemplate(factionId, side === 'front' && !source && !templates.isPending && !images.isPending)
  // Combat and upgrade backs show the faction's banner: its logo size (a share of the banner) and its ornament.
  // The event back keeps its own logo size, a share of the card.
  const bannered = category !== 'schema'
  const elementUrl = side === 'back' && bannered && banner.element_key ? images.data.find(i => i.key === banner.element_key)?.url : undefined
  const logoScale = bannered ? banner.logo_scale : eventLogoScale ?? saved?.logo_scale ?? 0.5
  const image = useMemo(() => source && side === 'back' ? { ...source, logoUrl: logo, logoScale, elementUrl } : source ?? nebula.image, [source, side, logo, logoScale, elementUrl, nebula.image])
  return { key: key ?? (nebula.image ? 'nebula' : undefined), image, isPending: templates.isPending || images.isPending || nebula.pending, queries: [templates, ...images.queries] }
}

// For layout previews: the chosen template, else the faction's newest image
// of a matching card type, else its newest image at all.
export function usePreviewTemplate(factionId: number | null, category: Category) {
  const template = useTemplate(factionId, category), images = useLibraryImages(), types = useCardTypes()
  const own = images.data.filter(i => i.factionId === factionId)
  const fallback = own.find(i => matchesCategory(types.data?.find(t => t.id === i.cardTypeId), category)) ?? own[0]
  return { image: template.image ?? fallback, chosen: !!template.image, isPending: template.isPending || types.isPending }
}
