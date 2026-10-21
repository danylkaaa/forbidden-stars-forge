import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'

// A faction's character picture, referenced when its faction card is generated; `synced` once it is on OpenAI.
// `placement` is where it is pasted on the faction card template: centre x and y (fractions of the template),
// height (a fraction of its height), and the box it is cut to (fractions of the template).
export type PlacementBox = { x: number; y: number; w: number; h: number }
export type CharacterPlacement = { x: number; y: number; scale: number; box: PlacementBox }
export type FactionCharacter = { faction_id: number; url: string; synced: boolean; sync_error?: string; placement: CharacterPlacement }
export const DEFAULT_PLACEMENT: CharacterPlacement = { x: 0.2, y: 0.5, scale: 1, box: { x: 0, y: 0, w: 0.42, h: 1 } }

export function useFactionCharacters() {
  return useQuery({ queryKey: ['faction-characters'], queryFn: () => apiGet<FactionCharacter[]>('/api/faction-characters') })
}

export function uploadCharacter(factionId: number, file: File) {
  const form = new FormData()
  form.append('character', file)
  return apiSendForm<FactionCharacter>('PUT', `/api/factions/${factionId}/character`, form)
}
export const syncCharacter = (factionId: number) => apiSend<FactionCharacter>('POST', `/api/factions/${factionId}/character/sync`, {})
export const saveCharacterPlacement = (factionId: number, placement: CharacterPlacement) =>
  apiSend<FactionCharacter>('PUT', `/api/factions/${factionId}/character/placement`, placement)
export const deleteCharacter = (factionId: number) => fetch(`/api/factions/${factionId}/character`, { method: 'DELETE' }).then((res) => { if (!res.ok) throw new Error('Could not remove the character.') })

// The card type that shows the faction's character: the faction card front (the back shows the leader's portrait).
export const usesCharacter = (cardTypeName: string | undefined) => cardTypeName === 'faction card'
// Both sides of the faction card: a landscape board with its own cut and safe lines.
export const isFactionCardType = (cardTypeName: string | undefined) => cardTypeName === 'faction card' || cardTypeName === 'faction card back'
