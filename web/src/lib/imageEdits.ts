import { useQueryClient } from '@tanstack/react-query'
import { apiSend } from './api'
import type { ImageRef } from './favorites'
import type { Generation } from '../pages/test-generation/api'

export type EditRequest = {
  target: ImageRef
  mask?: string // PNG data URL, transparent = edit here; left out to change the whole image
  instruction: string
  protect: boolean // keep original pixels outside the mask (needs a mask)
}

// Starts an area edit; the result is a new (pending) generation.
export function useStartImageEdit() {
  const queryClient = useQueryClient()
  return async ({ target, mask, instruction, protect }: EditRequest): Promise<Generation> => {
    const parent = target.kind === 'generation'
      ? { kind: 'generation', id: target.id }
      : { kind: 'batch-item', id: target.itemId, batch_id: target.batchId }
    const g = await apiSend<Generation>('POST', '/api/image-edits', { parent, mask, instruction, protect })
    queryClient.setQueryData<Generation[]>(['generations'], (old) => [g, ...(old ?? []).filter((x) => x.id !== g.id)])
    await queryClient.invalidateQueries({ queryKey: ['generations'], exact: true })
    return g
  }
}

// Image URL of the image an edit was made from, if any.
export function parentImageUrl(g: Pick<Generation, 'parent_kind' | 'parent_id' | 'parent_batch_id'>): string | null {
  if (g.parent_kind === 'generation') return `/api/generations/${g.parent_id}/image`
  if (g.parent_kind === 'batch-item') return `/api/batches/${g.parent_batch_id}/items/${g.parent_id}/image`
  return null
}
