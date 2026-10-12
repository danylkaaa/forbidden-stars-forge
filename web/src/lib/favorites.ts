import { useQueryClient } from '@tanstack/react-query'
import { apiSend } from './api'

// Which image a favorite toggle targets: a Faction Lab or a batch item.
export type ImageRef = { kind: 'generation'; id: number } | { kind: 'batch-item'; batchId: number; itemId: number }

function favoriteUrl(ref: ImageRef): string {
  return ref.kind === 'generation'
    ? `/api/generations/${ref.id}/favorite`
    : `/api/batches/${ref.batchId}/items/${ref.itemId}/favorite`
}

// Returns a setter that saves the flag, then refreshes every list that
// shows it (History, Generations, batch detail).
export function useSetFavorite() {
  const queryClient = useQueryClient()
  return async (ref: ImageRef, favorite: boolean) => {
    await apiSend('PUT', favoriteUrl(ref), { favorite })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['generations'] }),
      queryClient.invalidateQueries({ queryKey: ['batch-items'] }),
      queryClient.invalidateQueries({ queryKey: ['batches'] }),
    ])
  }
}
