import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CardDraft, Category } from '../cards/model'
import type { ArtworkTransform } from './artwork'
import type { TextPadding } from './api'
// Unsaved work survives reloads: card text drafts and artwork transforms per
// card id.
type State = {
  factionId: number | null; category: Category
  logoScales: Record<string, number>; titleScales: Record<string, number>
  textPaddings: Record<string, TextPadding>
  textPadding: (id: string, value: TextPadding) => void
  clearTextPadding: (id: string) => void
  titleScale: (id: string, value: number) => void
  clearTitleScale: (id: string) => void
  logoScale: (id: string, value: number) => void
  clearLogoScale: (id: string) => void
  edits: Record<string, CardDraft>; transforms: Record<string, ArtworkTransform>
  select: (selection: Partial<Pick<State, 'factionId' | 'category'>>) => void
  edit: (id: string, field: string, value: string) => void
  clearEdits: (id: string) => void
  transform: (id: string, value: ArtworkTransform) => void
  clearTransform: (id: string) => void
}
const without = <T,>(record: Record<string, T>, key: string) => { const next = { ...record }; delete next[key]; return next }
export const useAssembly = create<State>()(persist((set) => ({
  factionId: null, category: 'combat', logoScales: {}, titleScales: {}, textPaddings: {}, edits: {}, transforms: {},
  logoScale: (id, value) => set(s => ({ logoScales: { ...s.logoScales, [id]: value } })),
  clearLogoScale: id => set(s => ({ logoScales: without(s.logoScales, id) })),
  textPadding: (id, value) => set(s => ({ textPaddings: { ...s.textPaddings, [id]: value } })),
  clearTextPadding: id => set(s => ({ textPaddings: without(s.textPaddings ?? {}, id) })),
  titleScale: (id, value) => set(s => ({ titleScales: { ...s.titleScales, [id]: value } })),
  clearTitleScale: id => set(s => ({ titleScales: without(s.titleScales, id) })),
  select: selection => set(selection),
  edit: (id, field, value) => set(s => ({ edits: { ...s.edits, [id]: { ...s.edits[id], [field]: value } } })),
  clearEdits: id => set(s => ({ edits: without(s.edits, id) })),
  transform: (id, value) => set(s => ({ transforms: { ...s.transforms, [id]: value } })),
  clearTransform: id => set(s => ({ transforms: without(s.transforms, id) })),
}), { name: 'card-forge-assembly-v2' }))
