import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'
import { defaultArtwork, type ArtworkTransform } from './artwork'
import type { Layout } from './model'
import type { Category } from '../cards/model'
import { DEFAULT_NEBULA, type NebulaSettings } from './backDecor'
// A card's own tweaks: its title size as a multiple of the card type's size.
export type AssemblyLayout = Partial<Layout> & { title_scale?: number }
export const layoutWithTitleScale = (layout: AssemblyLayout, scale: number): AssemblyLayout => {
  const { title_scale: _, ...rest } = layout
  return scale === 1 ? rest : { ...rest, title_scale: scale }
}
export type Assembly = { image_key: string; image_url: string; overlay_id: string; subtype_id: number; logo_scale?: number; transform: ArtworkTransform; layout: AssemblyLayout; card_id?: number; updated_at?: string }
export const emptyAssembly = (): Assembly => ({ image_key: '', image_url: '', overlay_id: 'auto', subtype_id: 0, logo_scale: 1, transform: defaultArtwork(), layout: {} })
export function useCardAssembly(id: string) {
  return useQuery({ queryKey: ['card-assembly', id], enabled: !!id, queryFn: () => apiGet<Assembly>(`/api/cards/${id}/assembly`) })
}
export const saveAssembly = (id: string, a: Assembly) => apiSend<Assembly>('PUT', `/api/cards/${id}/assembly`, { image_key: a.image_key, overlay_id: a.overlay_id, subtype_id: a.subtype_id ?? 0, logo_scale: a.logo_scale ?? 1, transform: a.transform, layout: a.layout })
export function uploadArtwork(id: string, image: File) {
  const form = new FormData(); form.set('image', image)
  return apiSendForm<Assembly>('POST', `/api/cards/${id}/artwork`, form)
}

// Title and rules text positions per card category, shared by every card.
// `back` holds settings shared by every faction's card back.
export type CardTypeBack = { overlay_scale?: number }
export type CardTypeLayout = { category: Category; layout: Partial<Layout> & { back?: CardTypeBack } }
export const backOverlayScale = (layouts: CardTypeLayout[] | undefined, category: Category) => layouts?.find(l => l.category === category)?.layout.back?.overlay_scale ?? 1
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
export function uploadBackLogo(factionId: number, category: Category, file: File) {
  const form = new FormData(); form.set('logo', file)
  return apiSendForm<undefined>('PUT', `/api/assembly-templates/${factionId}/${category}/logo`, form)
}
export const removeBackLogo = (factionId: number, category: Category) => apiSend<undefined>('DELETE', `/api/assembly-templates/${factionId}/${category}/logo`, undefined)

// How a faction's event card back draws its nebula; saved per faction.
export type Nebula = NebulaSettings & { faction_id: number }
export function useNebulas() {
  return useQuery({ queryKey: ['nebulas'], queryFn: () => apiGet<Nebula[]>('/api/nebulas') })
}
export function useNebula(factionId: number | undefined): NebulaSettings {
  const nebulas = useNebulas()
  return nebulas.data?.find(n => n.faction_id === factionId) ?? DEFAULT_NEBULA
}
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
