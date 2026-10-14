import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'
import type { FactionCardData } from './model'

export type AssetRef = { key: string; url: string }
export type FactionCardRecord = { faction_id: number; data: Partial<FactionCardData>; front_image_key: string; back_image_key: string; unit_color: string; updated_at: string; assets: AssetRef[] }
export type FactionCardSave = { data: FactionCardData; front_image_key: string; back_image_key: string; unit_color: string }

export function useFactionCard(factionId: number | null) {
  return useQuery({ queryKey: ['faction-card', factionId], enabled: !!factionId, queryFn: () => apiGet<FactionCardRecord>(`/api/faction-cards/${factionId}`) })
}
// Ids of the factions that have a saved card.
export function useSavedFactionCards() {
  return useQuery({ queryKey: ['faction-cards'], queryFn: () => apiGet<number[]>('/api/faction-cards') })
}
export function useFactionCardDefaults() {
  return useQuery({ queryKey: ['faction-card-defaults'], queryFn: () => apiGet<AssetRef[]>('/api/faction-card-defaults') })
}
export const saveFactionCard = (factionId: number, card: FactionCardSave) => apiSend<FactionCardRecord>('PUT', `/api/faction-cards/${factionId}`, card)
// factionId 0 addresses the shared default icons.
export function uploadAsset(factionId: number, key: string, file: File) {
  const form = new FormData(); form.set('file', file)
  return apiSendForm<AssetRef>('PUT', `/api/faction-cards/${factionId}/assets/${key}`, form)
}
export const deleteAsset = (factionId: number, key: string) => apiSend<undefined>('DELETE', `/api/faction-cards/${factionId}/assets/${key}`, undefined)
