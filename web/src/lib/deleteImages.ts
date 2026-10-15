import type { QueryClient } from '@tanstack/react-query'
import { apiSend } from './api'
import type { ImageRef } from './favorites'

export const deleteImage = (target: ImageRef) => apiSend<undefined>('DELETE', `/api/generations/${target.id}`, undefined)

export const refreshImages = (client: QueryClient) => Promise.all(
  ['generations', 'assembly-templates', 'card-assembly'].map(key => client.invalidateQueries({ queryKey: [key] })),
)
