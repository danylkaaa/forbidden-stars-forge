import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'
import type { Category } from '../cards/model'
import type { Layout } from './model'

// A user-defined variant of a card category with its own overlay stack.
// Overlays are ordered bottom first.
export type SubtypeOverlay = { id: number; url: string }
// layout holds positions of the overlay-bound layers (OVERLAY_LAYERS).
export type Subtype = { id: number; category: Category; name: string; layout: Partial<Layout>; overlays: SubtypeOverlay[] }

export function useSubtypes() {
  return useQuery({ queryKey: ['subtypes'], queryFn: () => apiGet<Subtype[]>('/api/subtypes') })
}
export const createSubtype = (category: Category, name: string) => apiSend<Subtype>('POST', '/api/subtypes', { category, name })
export const renameSubtype = (id: number, name: string) => apiSend<Subtype>('PUT', `/api/subtypes/${id}`, { name })
export const saveSubtypeLayout = (id: number, layout: Partial<Layout>) => apiSend<Subtype>('PUT', `/api/subtypes/${id}/layout`, { layout })
export const deleteSubtype = (id: number) => apiSend<undefined>('DELETE', `/api/subtypes/${id}`, undefined)
export function uploadSubtypeOverlay(id: number, file: File) {
  const form = new FormData(); form.set('overlay', file)
  return apiSendForm<Subtype>('POST', `/api/subtypes/${id}/overlays`, form)
}
export const deleteSubtypeOverlay = (id: number, overlayId: number) => apiSend<Subtype>('DELETE', `/api/subtypes/${id}/overlays/${overlayId}`, undefined)
export const reorderSubtypeOverlays = (id: number, ids: number[]) => apiSend<Subtype>('PUT', `/api/subtypes/${id}/overlays/order`, { ids })

// Swap an overlay with its neighbour; `delta` +1 moves it up the stack.
export function moveOverlay(ids: number[], index: number, delta: number): number[] {
  const target = index + delta
  if (target < 0 || target >= ids.length) return ids
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]]
  return next
}

// Always present (created by the server, cannot be renamed or deleted).
// Combat cards without a chosen subtype use one of these by level.
export const BUILTIN_SUBTYPES = [{ category: 'combat', name: 'Level 0' }, { category: 'combat', name: 'Level 1+' }] as const
export const isBuiltinSubtype = (st: Pick<Subtype, 'category' | 'name'>) => BUILTIN_SUBTYPES.some(b => b.category === st.category && b.name === st.name)
export const levelSubtypeName = (level: number) => level === 0 ? 'Level 0' : 'Level 1+'

// The chosen subtype, or for combat cards the built-in one for its level.
export function resolveSubtype(subtypes: Subtype[] | undefined, chosenId: number | undefined, card: { category: string; level?: number } | null) {
  const chosen = chosenId ? subtypes?.find(s => s.id === chosenId) : undefined
  if (chosen || !card || card.category !== 'combat') return chosen
  return subtypes?.find(s => s.category === 'combat' && s.name === levelSubtypeName(card.level ?? 0))
}
