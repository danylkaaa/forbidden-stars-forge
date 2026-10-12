import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../test/msw'
import { useBatch, batchItemImageUrl, batchDownloadUrl, type Batch, type BatchItem } from './api'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const inProgress: Batch = {
  id: 1, openai_batch_id: 'b1', mode: 'draft', model: '', status: 'in_progress', jsonl_path: 'x', output_path: '',
  total_cost_usd: 0, submitted_at: 'a', completed_at: '', created_at: 'a', updated_at: 'a',
  counts: { completed: 0, failed: 0, total: 2 }, est_cost_usd: 0.02,
}

test('useBatch polls while status is in_progress and stops once completed', async () => {
  let calls = 0
  server.use(
    http.get('/api/batches/1', () => {
      calls++
      const status = calls < 2 ? 'in_progress' : 'completed'
      return HttpResponse.json({ batch: { ...inProgress, status }, items: [] })
    }),
  )
  const { result } = renderHook(() => useBatch(1, 10), { wrapper })
  await waitFor(() => expect(result.current.data?.batch.status).toBe('completed'))
  expect(calls).toBeGreaterThanOrEqual(2)
})

test('useBatch disabled when id is null', () => {
  const { result } = renderHook(() => useBatch(null), { wrapper })
  expect(result.current.fetchStatus).toBe('idle')
})

test('batchItemImageUrl is null unless the item is done with an image', () => {
  const pending: BatchItem = { id: 1, batch_id: 1, faction_id: 1, card_type_id: 1, custom_id: 'a__b', quality: 'low', name: '1-tau-combat-low', favorite: false, status: 'pending', image_path: '', input_tokens: 0, output_tokens: 0, cost_usd: 0, error: '' }
  const done: BatchItem = { ...pending, status: 'done', image_path: 'batches/1/a__b.png' }
  expect(batchItemImageUrl(1, pending)).toBeNull()
  expect(batchItemImageUrl(1, done)).toBe('/api/batches/1/items/1/image')
})

test('batchDownloadUrl builds the zip endpoint', () => {
  expect(batchDownloadUrl(7)).toBe('/api/batches/7/download')
})
