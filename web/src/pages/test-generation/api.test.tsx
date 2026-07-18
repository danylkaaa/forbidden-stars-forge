import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../test/msw'
import { useGeneration, generationImageUrl, formatCost, formatDuration, type Generation } from './api'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const base: Generation = {
  id: 7, faction_id: 1, card_type_id: 2, mode: 'draft', prompt: 'p', status: 'done',
  image_path: 'generated/gen-7.png', input_tokens: 100, output_tokens: 400,
  cost_usd: 0.012, duration_ms: 43000, error: '', created_at: '2026-07-18',
}

test('useGeneration polls until terminal', async () => {
  let calls = 0
  server.use(
    http.get('/api/generations/7', () => {
      calls++
      return HttpResponse.json(calls < 3 ? { ...base, status: 'pending', image_path: '' } : base)
    }),
  )
  const { result } = renderHook(() => useGeneration(7, 50), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('done'))
  expect(calls).toBeGreaterThanOrEqual(3)
})

test('useGeneration disabled when null', () => {
  const { result } = renderHook(() => useGeneration(null), { wrapper })
  expect(result.current.fetchStatus).toBe('idle')
})

test('generationImageUrl only for done', () => {
  expect(generationImageUrl(base)).toBe('/api/generations/7/image')
  expect(generationImageUrl({ ...base, status: 'pending' })).toBeNull()
  expect(generationImageUrl({ ...base, status: 'failed' })).toBeNull()
})

test('formatCost and formatDuration', () => {
  expect(formatCost(0.012)).toBe('$0.012')
  expect(formatCost(0.19)).toBe('$0.19')
  expect(formatCost(1.5)).toBe('$1.50')
  expect(formatDuration(43000)).toBe('43s')
  expect(formatDuration(134000)).toBe('2m 14s')
})
