import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'

export type BatchStatus = 'created' | 'submitted' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
export type BatchMode = 'draft' | 'final'

export type BatchCounts = { completed: number; failed: number; total: number }

export type Batch = {
  id: number
  openai_batch_id: string
  mode: BatchMode
  model: string
  status: BatchStatus
  jsonl_path: string
  output_path: string
  total_cost_usd: number
  submitted_at: string
  completed_at: string
  created_at: string
  updated_at: string
  counts: BatchCounts
  est_cost_usd: number
}

export type BatchItem = {
  id: number
  batch_id: number
  faction_id: number
  card_type_id: number
  custom_id: string
  quality: string
  name: string // "<n>-<faction>-<type>-<quality>"
  favorite: boolean
  status: 'pending' | 'done' | 'failed'
  image_path: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  error: string
}

export type BatchDetail = { batch: Batch; items: BatchItem[] }
export type BatchPreview = { jsonl: string; count: number; est_cost: number }
export type BatchScope = { faction_ids: number[]; card_type_ids: number[]; mode: BatchMode; model?: string }

const ACTIVE_STATUSES: BatchStatus[] = ['created', 'submitted', 'in_progress']

export function useBatches() {
  return useQuery({ queryKey: ['batches'], queryFn: () => apiGet<Batch[]>('/api/batches') })
}

export function useBatch(id: number | null, intervalMs = 60000) {
  return useQuery({
    queryKey: ['batches', id],
    queryFn: () => apiGet<BatchDetail>(`/api/batches/${id}`),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.batch.status
      return status && ACTIVE_STATUSES.includes(status) ? intervalMs : false
    },
  })
}

export function previewBatch(scope: BatchScope): Promise<BatchPreview> {
  return apiSend<BatchPreview>('POST', '/api/batches/preview', scope)
}

export function submitBatch(scope: BatchScope): Promise<Batch> {
  return apiSend<Batch>('POST', '/api/batches', scope)
}

export function cancelBatch(id: number): Promise<Batch> {
  return apiSend<Batch>('POST', `/api/batches/${id}/cancel`, undefined)
}

export function batchItemImageUrl(batchId: number, item: BatchItem): string | null {
  if (item.status !== 'done' || !item.image_path) return null
  return `/api/batches/${batchId}/items/${item.id}/image`
}

export function batchDownloadUrl(batchId: number): string {
  return `/api/batches/${batchId}/download`
}
