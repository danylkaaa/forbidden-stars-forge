import { useMemo } from 'react'
import { useCards } from '../cards/api'
import { useCardAssembly } from './api'
import { useTemplateLayout } from './library'
import { useFactionLogos } from './logos'
import { DEMO_COMBAT, withSubtypeLayout, type CombatCard } from './model'
import type { RenderInput } from './render'
import { resolveSubtype, useSubtypes } from './subtypes'
import { useRenderedCard } from './useCardView'
import { useDemoArtwork } from './demoArtwork'

// The faction's combat cards, for "preview with" pickers.
export function useFactionCombatCards(factionId: number | null) {
  const cards = useCards(factionId ? String(factionId) : '', 'combat')
  return useMemo(() => (cards.data ?? []).filter((c): c is CombatCard => c.category === 'combat' && c.faction_id === factionId), [cards.data, factionId])
}

// The demo card (at `demoLevel`) or the chosen card, for a faction.
export function usePreviewCard(factionId: number, cardId: number, demoLevel = DEMO_COMBAT.level) {
  const combat = useFactionCombatCards(factionId)
  const card = useMemo(() => combat.find(c => c.id === cardId) ?? { ...DEMO_COMBAT, faction_id: factionId, level: demoLevel }, [combat, cardId, factionId, demoLevel])
  return { card, combat }
}

// A generated image assembled with `card`: its text, artwork, level subtype
// and the faction logo, exactly as the library would draw it.
export function useAssembledPreview(imageUrl: string | null, factionId: number, card: CombatCard) {
  const demoArtwork = useDemoArtwork()
  const assembly = useCardAssembly(card.id ? String(card.id) : '')
  const template = useTemplateLayout()
  const subtypes = useSubtypes(), logos = useFactionLogos()
  const subtype = resolveSubtype(subtypes.data, assembly.data?.subtype_id, card)
  const logoUrl = logos.data?.find(l => l.faction_id === factionId)?.url ?? null
  const ready = template.ready && !subtypes.isPending && !logos.isPending && (!card.id || !assembly.isPending)
  const input = useMemo<RenderInput | null>(() => ready && imageUrl ? {
    card, layout: withSubtypeLayout(template.layout, subtype?.layout), imageUrl, overlayUrl: null,
    overlayUrls: subtype?.overlays.map(o => o.url) ?? [], logoUrl, logoScale: assembly.data?.logo_scale ?? 1, artworkUrl: card.id ? assembly.data?.image_url || null : demoArtwork, artwork: assembly.data?.transform,
  } : null, [ready, card, template.layout, subtype, imageUrl, logoUrl, assembly.data, demoArtwork])
  return useRenderedCard(input)
}
