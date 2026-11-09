import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'

// A faction's character picture, painted around by "with character" image types. `placement` is its centre x and y
// (fractions of the image) and its height (a fraction of the image's height); `flip` mirrors it left to right.
export type CharacterPlacement = { x: number; y: number; scale: number; flip?: boolean }
export type FactionCharacter = { faction_id: number; url: string; placement: CharacterPlacement }

export function useFactionCharacters() {
  return useQuery({ queryKey: ['faction-characters'], queryFn: () => apiGet<FactionCharacter[]>('/api/faction-characters') })
}

export function uploadCharacter(factionId: number, file: File) {
  const form = new FormData()
  form.append('character', file)
  return apiSendForm<FactionCharacter>('PUT', `/api/factions/${factionId}/character`, form)
}
export const saveCharacterPlacement = (factionId: number, placement: CharacterPlacement) =>
  apiSend<FactionCharacter>('PUT', `/api/factions/${factionId}/character/placement`, placement)
export const deleteCharacter = (factionId: number) => fetch(`/api/factions/${factionId}/character`, { method: 'DELETE' }).then((res) => { if (!res.ok) throw new Error('Could not remove the character.') })
