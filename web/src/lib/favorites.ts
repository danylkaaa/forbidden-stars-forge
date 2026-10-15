import { useQueryClient } from '@tanstack/react-query'
import { apiSend } from './api'

// Which image a favorite toggle targets: a Faction Lab generation.
export type ImageRef = { kind: 'generation'; id: number }

// Returns a setter that saves the flag, then refreshes every list that
// shows it (History, Generations).
export function useSetFavorite() {
  const queryClient = useQueryClient()
  return async (ref: ImageRef, favorite: boolean) => {
    await apiSend('PUT', `/api/generations/${ref.id}/favorite`, { favorite })
    await queryClient.invalidateQueries({ queryKey: ['generations'] })
  }
}
