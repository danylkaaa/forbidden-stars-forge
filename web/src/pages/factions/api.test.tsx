import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../test/msw'
import { useJob, deleteFaction } from './api'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

test('useJob polls until terminal status', async () => {
  let calls = 0
  server.use(
    http.get('/api/jobs/job-1', () => {
      calls++
      return HttpResponse.json(
        calls < 3
          ? { id: 'job-1', status: 'pending', duration_ms: 0 }
          : { id: 'job-1', status: 'done', result: 'generated', duration_ms: 1200 },
      )
    }),
  )
  const { result } = renderHook(() => useJob('job-1', 100), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('done'))
  expect(result.current.data?.result).toBe('generated')
  expect(calls).toBeGreaterThanOrEqual(3)
})

test('useJob disabled when jobId null', () => {
  const { result } = renderHook(() => useJob(null), { wrapper })
  expect(result.current.fetchStatus).toBe('idle')
})

test('deleteFaction resolves on 204', async () => {
  server.use(http.delete('/api/factions/5', () => new HttpResponse(null, { status: 204 })))
  await expect(deleteFaction(5)).resolves.toBeUndefined()
})
