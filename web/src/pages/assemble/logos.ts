import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'

// Drawn in the level badge of level 0 combat cards.
export type FactionLogo = { faction_id: number; url: string }
export function useFactionLogos() {
  return useQuery({ queryKey: ['faction-logos'], queryFn: () => apiGet<FactionLogo[]>('/api/faction-logos') })
}
export function uploadFactionLogo(factionId: number, file: File) {
  const form = new FormData(); form.set('logo', file)
  return apiSendForm<FactionLogo>('PUT', `/api/factions/${factionId}/logo`, form)
}
export const deleteFactionLogo = (factionId: number) => apiSend<undefined>('DELETE', `/api/factions/${factionId}/logo`, undefined)
