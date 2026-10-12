import type { QueryClient } from '@tanstack/react-query'
import { apiSend } from './api'
import type { ImageRef } from './favorites'

export const deleteImage = (target: ImageRef) => apiSend<undefined>('DELETE', target.kind === 'generation'
  ? `/api/generations/${target.id}` : `/api/batches/${target.batchId}/items/${target.itemId}`, undefined)

export const refreshImages = (client: QueryClient) => Promise.all(
  ['generations', 'batch-items', 'batches', 'assembly-templates', 'card-assembly'].map(key => client.invalidateQueries({ queryKey: [key] })),
)
