import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from './api'

// Background jobs (claude CLI runs) — started by an endpoint that returns
// a job_id, then polled until done/failed.
export type Job = {
  id: string
  status: 'pending' | 'done' | 'failed'
  result?: string
  error?: string
  duration_ms: number
}

// One turn of an edit conversation with Claude.
export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function cancelJob(jobId: string): Promise<{ ok: boolean }> {
  return apiSend('POST', `/api/jobs/${jobId}/cancel`, undefined)
}

export function useJob(jobId: string | null, intervalMs = 2000) {
  return useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => apiGet<Job>(`/api/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'done' || s === 'failed' ? false : intervalMs
    },
  })
}
