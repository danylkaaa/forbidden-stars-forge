import { useMemo } from 'react'
import { useCards } from '../cards/api'
import { useCardAssembly, type EventElementSettings } from './api'
import { useEventElementInput } from './eventElement'
import { useTemplateLayout } from './library'
import { useFactionLogos } from './logos'
import type { Category } from '../cards/model'
import { DEMO_COMBAT, DEMO_SCHEMA, type CombatCard, type FramedCard } from './model'
import type { RenderInput } from './render'
import { useRenderedCard } from './useCardView'
import { useDemoArtwork } from './demoArtwork'

// The faction's combat cards, for "preview with" pickers.
export function useFactionCombatCards(factionId: number | null) {
  const cards = useCards(factionId ? String(factionId) : '', 'combat')
  return useMemo(() => (cards.data ?? []).filter((c): c is CombatCard => c.category === 'combat' && c.faction_id === factionId), [cards.data, factionId])
}

// The faction's event cards.
function useFactionEventCards(factionId: number | null) {
  const cards = useCards(factionId ? String(factionId) : '', 'schema')
  return useMemo(() => (cards.data ?? []).filter((c): c is FramedCard => c.category === 'schema' && c.faction_id === factionId), [cards.data, factionId])
}

// The demo card (at `demoLevel`) or the chosen card, for a faction. `category` is the kind of card previewed: combat
// (the default) or schema (event); `combat` lists the faction's cards of that kind.
export function usePreviewCard(factionId: number, cardId: number, demoLevel?: number, category?: 'combat'): { card: CombatCard; combat: CombatCard[] }
export function usePreviewCard(factionId: number, cardId: number, demoLevel: number | undefined, category: Category): { card: CombatCard | FramedCard; combat: (CombatCard | FramedCard)[] }
export function usePreviewCard(factionId: number, cardId: number, demoLevel = DEMO_COMBAT.level, category: Category = 'combat') {
  const combatCards = useFactionCombatCards(factionId), eventCards = useFactionEventCards(factionId)
  const list: (CombatCard | FramedCard)[] = category === 'schema' ? eventCards : combatCards
  const card = useMemo<CombatCard | FramedCard>(() => list.find(c => c.id === cardId) ?? (category === 'schema'
    ? { ...DEMO_SCHEMA, faction_id: factionId }
    : { ...DEMO_COMBAT, faction_id: factionId, level: demoLevel, starting: demoLevel === 0 }), [list, cardId, factionId, demoLevel, category])
  return { card, combat: list }
}

// A generated image assembled with `card`: its text, artwork, ribbon
// and the faction logo, exactly as the library would draw it.
export function useAssembledPreview(imageUrl: string | null, factionId: number, card: CombatCard | FramedCard, eventElementDraft?: EventElementSettings) {
  const demoArtwork = useDemoArtwork()
  const assembly = useCardAssembly(card.id ? String(card.id) : '')
  const template = useTemplateLayout(card.category)
  const logos = useFactionLogos()
  const logoUrl = logos.data?.find(l => l.faction_id === factionId)?.url ?? null
  const eventElement = useEventElementInput(card.category === 'schema' ? factionId : null, eventElementDraft)
  const ready = template.ready && !logos.isPending && (!card.id || !assembly.isPending)
  const input = useMemo<RenderInput | null>(() => ready && imageUrl ? {
    card, layout: template.layout, imageUrl, logoUrl, logoScale: assembly.data?.logo_scale ?? 1, artworkUrl: card.id ? assembly.data?.image_url || null : demoArtwork, artwork: assembly.data?.transform, eventElement,
  } : null, [ready, card, template.layout, imageUrl, logoUrl, assembly.data, demoArtwork, eventElement])
  return useRenderedCard(input)
}
