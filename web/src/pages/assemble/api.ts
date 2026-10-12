import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'
import { defaultArtwork, type ArtworkTransform } from './artwork'
import type { Layout } from './model'
export type Assembly = { image_key: string; image_url: string; overlay_id: string; transform: ArtworkTransform; layout: Partial<Layout>; card_id?: number; updated_at?: string }
export const emptyAssembly = (): Assembly => ({ image_key: '', image_url: '', overlay_id: 'auto', transform: defaultArtwork(), layout: {} })
export function useCardAssembly(id: string) {
  return useQuery({ queryKey: ['card-assembly', id], enabled: !!id, queryFn: () => apiGet<Assembly>(`/api/cards/${id}/assembly`) })
}
export const saveAssembly = (id: string, a: Assembly) => apiSend<Assembly>('PUT', `/api/cards/${id}/assembly`, { image_key: a.image_key, overlay_id: a.overlay_id, transform: a.transform, layout: a.layout })
export function uploadArtwork(id: string, image: File) {
  const form = new FormData(); form.set('image', image)
  return apiSendForm<Assembly>('POST', `/api/cards/${id}/artwork`, form)
}

export type LayoutScope = { template_key: string; faction_id: number; card_type_id: number }
export const layoutScopeKey = (scope: LayoutScope | null) => scope ? JSON.stringify([scope.template_key, scope.faction_id, scope.card_type_id]) : ''
const layoutScopeParams = (scope: LayoutScope) => new URLSearchParams({ template_key: scope.template_key, faction_id: String(scope.faction_id), card_type_id: String(scope.card_type_id) })
export function useSharedLayout(scope: LayoutScope | null) {
  return useQuery({ queryKey: ['assembly-layout', layoutScopeKey(scope)], enabled: !!scope, queryFn: () => apiGet<{ layout: Partial<Layout> }>(`/api/assembly-layout?${layoutScopeParams(scope!)}`) })
}
export const saveSharedLayout = (scope: LayoutScope, layout: Layout) => apiSend<{ layout: Partial<Layout> }>('PUT', `/api/assembly-layout?${layoutScopeParams(scope)}`, { layout })
