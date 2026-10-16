import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'
import type { ChatMessage } from '../../lib/jobs'

export type Generation = {
  id: number
  faction_id: number
  card_type_id: number
  mode: 'draft' | 'final'
  model: string // '' on rows made before per-run models
  quality: string
  name: string // "<n>-<faction>-<type>-<quality>"
  favorite: boolean
  // Set when this is an area edit of an earlier image.
  parent_kind: '' | 'generation'
  parent_id: number
  parent_name: string
  edit_instruction: string
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
  // How long one image typically takes with these settings, from past runs (0 when there is no history).
  est_draft_seconds?: number
  est_final_seconds?: number
}

export function useGenerations() {
  return useQuery({
    queryKey: ['generations'],
    queryFn: () => apiGet<Generation[]>('/api/generations'),
    // Keep polling while anything is in flight (e.g. after a page reload).
    refetchInterval: (query) => (query.state.data?.some((g) => g.status === 'pending') ? 2000 : false),
  })
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

// model ('' = Settings default) only affects the cost estimate.
export function usePreview(factionId: number | null, cardTypeId: number | null, model = '') {
  return useQuery({
    queryKey: ['generate-preview', factionId, cardTypeId, model],
    queryFn: () => {
      const q = new URLSearchParams({ faction_id: String(factionId), card_type_id: String(cardTypeId) })
      if (model) q.set('model', model)
      return apiGet<Preview>(`/api/generate/preview?${q}`)
    },
    enabled: factionId !== null && cardTypeId !== null,
    // Switching only the model keeps the prompt on screen while the estimate
    // refreshes; a different faction/card type starts clean.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === factionId && prevQuery?.queryKey[2] === cardTypeId ? prev : undefined,
  })
}

export function startGeneration(body: {
  faction_id: number
  card_type_id: number
  mode: 'draft' | 'final'
  prompt_override?: string
  model?: string
  front_image?: { kind: 'generation'; id: number }
}): Promise<Generation> {
  return apiSend<Generation>('POST', '/api/generate', body)
}

// startGeneration plus showing the new pending row in History right away
// (newest first, like the server); the list then polls until it finishes.
export function useStartGeneration() {
  const queryClient = useQueryClient()
  return async (body: Parameters<typeof startGeneration>[0]): Promise<Generation> => {
    const g = await startGeneration(body)
    queryClient.setQueryData<Generation[]>(['generations'], (old) => [g, ...(old ?? []).filter((x) => x.id !== g.id)])
    queryClient.invalidateQueries({ queryKey: ['generations'], exact: true })
    return g
  }
}

export function generationImageUrl(g: Generation): string | null {
  if (g.status !== 'done') return null
  return `/api/generations/${g.id}/image`
}

export { formatCost, formatDuration } from '../../lib/format'

// Claude edits the full image prompt (the AI Lab override),
// following the whole conversation.
export function startPromptAssist(currentPrompt: string, messages: ChatMessage[]): Promise<{ job_id: string; status: string }> {
  return apiSend('POST', '/api/generate/prompt-assist', { current_prompt: currentPrompt, messages })
}
