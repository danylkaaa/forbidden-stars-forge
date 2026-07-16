import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'
import type { DLC } from './dlc'

export type Faction = {
  id: number
  name: string
  description: string
  dlc: DLC
  created_at: string
  updated_at: string
}

export type FactionRevision = {
  id: number
  faction_id: number
  name: string
  description: string
  dlc: DLC
  source: 'manual' | 'claude' | 'rollback'
  created_at: string
}

export type FactionSave = {
  name: string
  description: string
  dlc: DLC
  source: 'manual' | 'claude'
}

export type Job = {
  id: string
  status: 'pending' | 'done' | 'failed'
  result?: string
  error?: string
  duration_ms: number
}

export function useFactions() {
  return useQuery({ queryKey: ['factions'], queryFn: () => apiGet<Faction[]>('/api/factions') })
}

export function createFaction(s: FactionSave): Promise<Faction> {
  return apiSend<Faction>('POST', '/api/factions', s)
}

export function updateFaction(id: number, s: FactionSave): Promise<Faction> {
  return apiSend<Faction>('PUT', `/api/factions/${id}`, s)
}

export function deleteFaction(id: number): Promise<undefined> {
  return apiSend<undefined>('DELETE', `/api/factions/${id}`, undefined)
}

export function useRevisions(factionId: number | null) {
  return useQuery({
    queryKey: ['factions', factionId, 'revisions'],
    queryFn: () => apiGet<FactionRevision[]>(`/api/factions/${factionId}/revisions`),
    enabled: factionId !== null,
  })
}

export function restoreRevision(factionId: number, revId: number): Promise<Faction> {
  return apiSend<Faction>('POST', `/api/factions/${factionId}/revisions/${revId}/restore`, undefined)
}

export function startGenerateDescription(name: string, dlc: DLC): Promise<{ job_id: string; status: string }> {
  return apiSend('POST', '/api/factions/generate-description', { name, dlc })
}

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
