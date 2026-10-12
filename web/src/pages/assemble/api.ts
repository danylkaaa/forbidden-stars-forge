import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'
import { defaultArtwork, type ArtworkTransform } from './artwork'
import type { Layout } from './model'
import type { Category } from '../cards/model'
export type Assembly = { image_key: string; image_url: string; overlay_id: string; subtype_id: number; logo_scale?: number; transform: ArtworkTransform; layout: Partial<Layout>; card_id?: number; updated_at?: string }
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
export type CardTypeLayout = { category: Category; layout: Partial<Layout> }
export function useCardTypeLayouts() {
  return useQuery({ queryKey: ['card-type-layouts'], queryFn: () => apiGet<CardTypeLayout[]>('/api/card-type-layouts') })
}
export const saveCardTypeLayout = (category: Category, layout: Partial<Layout>) => apiSend<CardTypeLayout>('PUT', `/api/card-type-layouts/${category}`, { layout })

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
