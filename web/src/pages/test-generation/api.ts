import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'

export type Generation = {
  id: number
  faction_id: number
  card_type_id: number
  mode: 'draft' | 'final'
  prompt: string
  status: 'pending' | 'done' | 'failed'
  image_path: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  error: string
  created_at: string
}

export type Preview = {
  prompt: string
  has_file: boolean
  est_draft_usd: number
  est_final_usd: number
}

export function useGenerations() {
  return useQuery({ queryKey: ['generations'], queryFn: () => apiGet<Generation[]>('/api/generations') })
}

export function useGeneration(id: number | null, intervalMs = 2000) {
  return useQuery({
    queryKey: ['generations', id],
    queryFn: () => apiGet<Generation>(`/api/generations/${id}`),
    enabled: id !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'done' || s === 'failed' ? false : intervalMs
    },
  })
}

export function usePreview(factionId: number | null, cardTypeId: number | null) {
  return useQuery({
    queryKey: ['generate-preview', factionId, cardTypeId],
    queryFn: () => apiGet<Preview>(`/api/generate/preview?faction_id=${factionId}&card_type_id=${cardTypeId}`),
    enabled: factionId !== null && cardTypeId !== null,
  })
}

export function startGeneration(body: {
  faction_id: number
  card_type_id: number
  mode: 'draft' | 'final'
  prompt_override?: string
}): Promise<Generation> {
  return apiSend<Generation>('POST', '/api/generate', body)
}

export function generationImageUrl(g: Generation): string | null {
  if (g.status !== 'done') return null
  return `/api/generations/${g.id}/image`
}

export { formatCost, formatDuration } from '../../lib/format'
