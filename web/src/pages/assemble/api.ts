import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'
import { defaultArtwork, type ArtworkTransform } from './artwork'
import type { Layout } from './model'
import type { Category } from '../cards/model'
import { DEFAULT_NEBULA, NO_PLACEMENT, type NebulaPlacement, type NebulaSettings } from './backDecor'
// A card's own tweaks: its title size as a multiple of the card type's size.
// A card's own margins above and below its upper and lower text, in % of the card's width (the template's apply where unset).
export type TextPadding = { upper_top?: number; upper_bottom?: number; lower_top?: number; lower_bottom?: number }
export type AssemblyLayout = Partial<Layout> & { title_scale?: number; description_scale?: number; lower_scale?: number; text_padding?: TextPadding }
// The layout to save with a card: its title and description sizes and text margins are kept only when they differ from the template's.
export const layoutWithTitleScale = (layout: AssemblyLayout, scale: number, padding?: TextPadding, descriptionScale = 1, lowerScale = 1): AssemblyLayout => {
  const { title_scale: _, text_padding: __, description_scale: ___, lower_scale: ____, ...rest } = layout
  const set = Object.fromEntries(Object.entries(padding ?? {}).filter(([, v]) => typeof v === 'number')) as TextPadding
  return { ...rest, ...(scale === 1 ? {} : { title_scale: scale }), ...(descriptionScale === 1 ? {} : { description_scale: descriptionScale }), ...(lowerScale === 1 ? {} : { lower_scale: lowerScale }), ...(Object.keys(set).length ? { text_padding: set } : {}) }
}
export type Assembly = { image_key: string; image_url: string; overlay_id: string; logo_scale?: number; transform: ArtworkTransform; layout: AssemblyLayout; card_id?: number; updated_at?: string }
export const emptyAssembly = (): Assembly => ({ image_key: '', image_url: '', overlay_id: 'auto', logo_scale: 1, transform: defaultArtwork(), layout: {} })
export function useCardAssembly(id: string) {
  return useQuery({ queryKey: ['card-assembly', id], enabled: !!id, queryFn: () => apiGet<Assembly>(`/api/cards/${id}/assembly`) })
}
export const saveAssembly = (id: string, a: Assembly) => apiSend<Assembly>('PUT', `/api/cards/${id}/assembly`, { image_key: a.image_key, overlay_id: a.overlay_id, logo_scale: a.logo_scale ?? 1, transform: a.transform, layout: a.layout })
export function uploadArtwork(id: string, image: File) {
  const form = new FormData(); form.set('image', image)
  return apiSendForm<Assembly>('POST', `/api/cards/${id}/artwork`, form)
}

// Asks the model (at final quality) to paint more around the card's artwork until it has the width / height ratio, and
// replaces the artwork with the result. `cost_usd` is what it cost.
export const extendArtwork = (id: string, ratio: number, prompt = '') => apiSend<Assembly & { cost_usd: number }>('POST', `/api/cards/${id}/artwork/extend`, { ratio, prompt })

// Title and rules text positions per card category, shared by every card.
// `back` holds settings shared by every faction's card back.
// `overlay_scale`: the size of the banner (combat, upgrade) or hexagon (event) on this card type's back, the same for every faction.
export type CardTypeBack = { overlay_scale?: number }
export type CardTypeLayout = { category: Category; layout: Partial<Layout> & { back?: CardTypeBack } }
// The upgrade back's frame is drawn smaller than the combat one unless set.
export const DEFAULT_UPGRADE_FRAME = 0.8
export const backOverlayScale = (layouts: CardTypeLayout[] | undefined, category: Category) => layouts?.find(l => l.category === category)?.layout.back?.overlay_scale ?? (category === 'upgrade' ? DEFAULT_UPGRADE_FRAME : 1)
export function useBackOverlayScale(category?: Category) {
  const layouts = useCardTypeLayouts()
  return category ? backOverlayScale(layouts.data, category) : 1
}
export function useCardTypeLayouts() {
  return useQuery({ queryKey: ['card-type-layouts'], queryFn: () => apiGet<CardTypeLayout[]>('/api/card-type-layouts') })
}
export const saveCardTypeLayout = (category: Category, layout: CardTypeLayout['layout']) => apiSend<CardTypeLayout>('PUT', `/api/card-type-layouts/${category}`, { layout })

// side: 'front' is the template cards are assembled on, 'back' the deck's card back.
export type Side = 'front' | 'back'
export type AssemblyTemplate = { faction_id: number; category: Category; side?: Side; image_key: string; logo_url?: string; logo_scale?: number }
export function useAssemblyTemplates() {
  return useQuery({ queryKey: ['assembly-templates'], queryFn: () => apiGet<AssemblyTemplate[]>('/api/assembly-templates') })
}
export const saveAssemblyTemplate = (t: AssemblyTemplate) => apiSend<AssemblyTemplate>('PUT', '/api/assembly-templates', t)

// How a faction's event card back draws its nebula; saved per faction.
export type Nebula = NebulaSettings & { faction_id: number }
export function useNebulas() {
  return useQuery({ queryKey: ['nebulas'], queryFn: () => apiGet<Nebula[]>('/api/nebulas') })
}
export function useNebula(factionId: number | undefined): NebulaSettings {
  const nebulas = useNebulas()
  return nebulas.data?.find(n => n.faction_id === factionId) ?? DEFAULT_NEBULA
}
export type FactionColor = { faction_id: number; color: string }
export function useFactionColors() {
  return useQuery({ queryKey: ['faction-colors'], queryFn: () => apiGet<FactionColor[]>('/api/faction-colors') })
}
// The faction's own colour as #rrggbb, or '' while it has none.
export function useFactionColor(factionId: number | null | undefined) {
  return useFactionColors().data?.find(c => c.faction_id === factionId)?.color ?? ''
}
// The nebula as drawn: with no colour of its own it takes the faction's colour.
export function useDrawnNebula(factionId: number | undefined): NebulaSettings {
  const nebula = useNebula(factionId), color = useFactionColor(factionId)
  return nebula.color || !color ? nebula : { ...nebula, color }
}
// Where each card type's back shows the nebula (per faction and type).
export type NebulaPlacementRow = NebulaPlacement & { faction_id: number; category: Category; logo_scale: number; banner_scale?: number; brightness?: number }
export function useNebulaPlacements() {
  return useQuery({ queryKey: ['nebula-placements'], queryFn: () => apiGet<NebulaPlacementRow[]>('/api/nebula-placements') })
}
export function useNebulaPlacement(factionId: number | undefined, category?: Category): NebulaPlacement {
  const rows = useNebulaPlacements().data
  const row = rows?.find(r => r.faction_id === factionId && r.category === category)
  return row ? { x: row.x, y: row.y, rotation: row.rotation, brightness: row.brightness || undefined } : NO_PLACEMENT
}
// The faction logo's size on a card type's back, per faction; undefined until saved.
export function useBackLogoScale(factionId: number | null | undefined, category: Category) {
  return useNebulaPlacements().data?.find(r => r.faction_id === factionId && r.category === category)?.logo_scale
}
// How much larger or smaller than the card template's banner size a faction's back draws its banner (1 = the template's).
export function useBannerScale(factionId: number | null | undefined, category?: Category) {
  return useNebulaPlacements().data?.find(r => r.faction_id === factionId && r.category === category)?.banner_scale ?? 1
}
export const saveNebulaPlacement = (factionId: number, category: Category, p: NebulaPlacement & { logo_scale?: number; banner_scale?: number }) => apiSend<NebulaPlacementRow>('PUT', `/api/nebula-placements/${factionId}/${category}`, p)
export const saveFactionColor = (factionId: number, color: string) => apiSend<FactionColor>('PUT', `/api/faction-colors/${factionId}`, { color })

export const saveNebula = (factionId: number, n: NebulaSettings) => apiSend<Nebula>('PUT', `/api/nebulas/${factionId}`, n)

// A card type's own nebula picture (shared by every faction, recoloured per
// faction); without one the bundled picture or a generated nebula is used.
export type NebulaPicture = { category: Category; url: string }
export function useNebulaPictures() {
  return useQuery({ queryKey: ['nebula-pictures'], queryFn: () => apiGet<NebulaPicture[]>('/api/nebula-pictures') })
}
export function useNebulaPicture(category?: Category) {
  const pictures = useNebulaPictures()
  return category ? pictures.data?.find(p => p.category === category)?.url : undefined
}
export function uploadNebulaPicture(category: Category, file: File) {
  const form = new FormData(); form.set('image', file)
  return apiSendForm<undefined>('PUT', `/api/nebula-pictures/${category}`, form)
}
export const removeNebulaPicture = (category: Category) => apiSend<undefined>('DELETE', `/api/nebula-pictures/${category}`, undefined)

// Pictures of real or sample cards per card type and side (and the faction card),
// to compare against while editing or to lay over a preview.
export type ReferenceCategory = Category | 'faction'
export type ReferenceCard = { id: number; category: ReferenceCategory; side: Side; name: string; url: string }
export function useReferenceCards(category?: ReferenceCategory, side?: Side) {
  const query = useQuery({ queryKey: ['reference-cards'], queryFn: () => apiGet<ReferenceCard[]>('/api/reference-cards') })
  return { ...query, cards: (query.data ?? []).filter(c => (!category || c.category === category) && (!side || c.side === side)) }
}
export function uploadReferenceCard(category: ReferenceCategory, file: File, side: Side = 'front') {
  const form = new FormData(); form.set('image', file); form.set('side', side)
  return apiSendForm<ReferenceCard>('POST', `/api/reference-cards/${category}`, form)
}
export const deleteReferenceCard = (id: number) => apiSend<undefined>('DELETE', `/api/reference-cards/${id}`, undefined)

// A faction's banner, assembled once in its settings: the frame with the logo
// inside and an ornament over the frame's edges (a library image, its place and
// width as shares of the frame). Combat and upgrade backs draw it.
export type BannerSettings = { logo_scale: number; element_key: string; element_x: number; element_y: number; element_scale: number }
export type FactionBanner = BannerSettings & { faction_id: number }
export const DEFAULT_BANNER: BannerSettings = { logo_scale: 0.5, element_key: '', element_x: 0, element_y: 0, element_scale: 0.42 }
export function useFactionBanners() {
  return useQuery({ queryKey: ['faction-banners'], queryFn: () => apiGet<FactionBanner[]>('/api/faction-banners') })
}
export function useFactionBanner(factionId: number | null | undefined): BannerSettings {
  const { faction_id: _faction, ...banner } = useFactionBanners().data?.find(b => b.faction_id === factionId) ?? { faction_id: 0, ...DEFAULT_BANNER }
  return banner
}
// The ornament on a faction's event cards: a library image with its place (offsets from the default spot, shares of
// the card) and width (a share of the card). One per faction, drawn on every event card.
export type EventElementSettings = { element_key: string; element_x: number; element_y: number; element_scale: number }
export type FactionEventElement = EventElementSettings & { faction_id: number }
export const DEFAULT_EVENT_ELEMENT: EventElementSettings = { element_key: '', element_x: 0, element_y: 0, element_scale: 0.5 }
export function useFactionEventElements() {
  return useQuery({ queryKey: ['faction-event-elements'], queryFn: () => apiGet<FactionEventElement[]>('/api/faction-event-elements') })
}
export function useFactionEventElement(factionId: number | null | undefined): EventElementSettings {
  const { faction_id: _faction, ...element } = useFactionEventElements().data?.find(e => e.faction_id === factionId) ?? { faction_id: 0, ...DEFAULT_EVENT_ELEMENT }
  return element
}
export const saveFactionEventElement = (factionId: number, e: EventElementSettings) => apiSend<FactionEventElement>('PUT', `/api/faction-event-elements/${factionId}`, e)
export const saveFactionBanner = (factionId: number, b: BannerSettings) => apiSend<FactionBanner>('PUT', `/api/faction-banners/${factionId}`, b)

// The size of a faction's logo on its cards, shared by every card of that faction and category (1 = the layout's logo box).
export type CardLogoScale = { faction_id: number; category: Category; scale: number }
export function useCardLogoScales() {
  return useQuery({ queryKey: ['card-logo-scales'], queryFn: () => apiGet<CardLogoScale[]>('/api/card-logo-scales') })
}
export const cardLogoScale = (rows: CardLogoScale[] | undefined, factionId: number | null | undefined, category: Category | undefined) =>
  rows?.find(r => r.faction_id === factionId && r.category === category)?.scale ?? 1
export const saveCardLogoScale = (factionId: number, category: Category, scale: number) =>
  apiSend<CardLogoScale>('PUT', `/api/card-logo-scales/${factionId}/${category}`, { scale })
// The shared logo size and a setter: the new size shows at once on every card, and is saved shortly after the last change.
export function useSharedLogoScale(factionId: number | null | undefined, category: Category | undefined): [number, (scale: number) => void] {
  const rows = useCardLogoScales(), queryClient = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const set = (scale: number) => {
    if (!factionId || !category) return
    queryClient.setQueryData<CardLogoScale[]>(['card-logo-scales'], old => [...(old ?? []).filter(r => !(r.faction_id === factionId && r.category === category)), { faction_id: factionId, category, scale }])
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { void saveCardLogoScale(factionId, category, scale).catch(() => queryClient.invalidateQueries({ queryKey: ['card-logo-scales'] })) }, 300)
  }
  return [cardLogoScale(rows.data, factionId, category), set]
}

