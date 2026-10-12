import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'
import type { DLC } from './dlc'
import type { ChatMessage } from '../../lib/jobs'

// Shared job/chat helpers live in lib/jobs; re-exported for existing callers.
export { cancelJob, useJob, type ChatMessage, type Job } from '../../lib/jobs'

export type Faction = {
  id: number
  name: string
  primary_color: string
  texture: string // material, e.g. metal / skin / wood
  description: string // the rest of the style
  dlc: DLC
  created_at: string
  updated_at: string
}

export type FactionRevision = {
  id: number
  faction_id: number
  name: string
  primary_color: string
  texture: string
  description: string
  dlc: DLC
  source: 'manual' | 'claude' | 'rollback'
  created_at: string
}

export type FactionSave = {
  name: string
  primary_color: string
  texture: string
  description: string
  dlc: DLC
  source: 'manual' | 'claude'
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

// Without chat: one-shot description from name + DLC. With chat: Claude
// edits current_description following the whole conversation (the CLI is
// stateless, so the full history is sent every turn).
export function startGenerateDescription(
  name: string,
  dlc: DLC,
  chat?: { primary_color: string; texture: string; current_description: string; messages: ChatMessage[] },
): Promise<{ job_id: string; status: string }> {
  return apiSend('POST', '/api/factions/generate-description', { name, dlc, ...chat })
}


