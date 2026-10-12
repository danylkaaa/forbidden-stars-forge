import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'
import type { Card, CardInput } from './model'
import type { ValidationIssue } from './validation'
export function useCards(factionId: string, category: string) {
  const params = new URLSearchParams()
  if (factionId) params.set('faction_id', factionId)
  if (category) params.set('category', category)
  return useQuery({ queryKey: ['cards', factionId, category], queryFn: () => apiGet<Card[]>(`/api/cards${params.size ? `?${params}` : ''}`) })
}
export const createCard = (input: CardInput) => apiSend<Card>('POST', '/api/cards', input)
export const updateCard = (id: number, input: CardInput) => apiSend<Card>('PUT', `/api/cards/${id}`, input)
export class ImportError extends Error {
  issues: ValidationIssue[]
  constructor(message: string, issues: ValidationIssue[]) { super(message); this.issues = issues }
}
// Import needs indexed server errors as well as the ordinary API message.
export async function importCards(cards: CardInput[]): Promise<{ cards: Card[]; count: number }> {
  const res = await fetch('/api/cards/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cards }) })
  const body = await res.json()
  if (!res.ok) throw new ImportError(body.error ?? `HTTP ${res.status}`, body.errors ?? [])
  return body
}
