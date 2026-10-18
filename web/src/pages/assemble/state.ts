import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CardDraft, Category } from '../cards/model'
import type { ArtworkTransform } from './artwork'
import type { TextPadding } from './api'
// Unsaved work survives reloads: card text drafts and artwork transforms per
// card id.
type State = {
  factionId: number | null; category: Category
  logoScales: Record<string, number>; titleScales: Record<string, number>; descriptionScales: Record<string, number>; lowerScales: Record<string, number>; resourcesScales: Record<string, number>
  textPaddings: Record<string, TextPadding>
  textPadding: (id: string, value: TextPadding) => void
  clearTextPadding: (id: string) => void
  titleScale: (id: string, value: number) => void
  clearTitleScale: (id: string) => void
  descriptionScale: (id: string, value: number) => void
  clearDescriptionScale: (id: string) => void
  lowerScale: (id: string, value: number) => void
  clearLowerScale: (id: string) => void
  resourcesScale: (id: string, value: number) => void
  clearResourcesScale: (id: string) => void
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
  factionId: null, category: 'combat', logoScales: {}, titleScales: {}, descriptionScales: {}, lowerScales: {}, resourcesScales: {}, textPaddings: {}, edits: {}, transforms: {},
  logoScale: (id, value) => set(s => ({ logoScales: { ...s.logoScales, [id]: value } })),
  clearLogoScale: id => set(s => ({ logoScales: without(s.logoScales, id) })),
  textPadding: (id, value) => set(s => ({ textPaddings: { ...s.textPaddings, [id]: value } })),
  clearTextPadding: id => set(s => ({ textPaddings: without(s.textPaddings ?? {}, id) })),
  titleScale: (id, value) => set(s => ({ titleScales: { ...s.titleScales, [id]: value } })),
  clearTitleScale: id => set(s => ({ titleScales: without(s.titleScales, id) })),
  descriptionScale: (id, value) => set(s => ({ descriptionScales: { ...s.descriptionScales, [id]: value } })),
  clearDescriptionScale: id => set(s => ({ descriptionScales: without(s.descriptionScales ?? {}, id) })),
  lowerScale: (id, value) => set(s => ({ lowerScales: { ...s.lowerScales, [id]: value } })),
  clearLowerScale: id => set(s => ({ lowerScales: without(s.lowerScales ?? {}, id) })),
  resourcesScale: (id, value) => set(s => ({ resourcesScales: { ...s.resourcesScales, [id]: value } })),
  clearResourcesScale: id => set(s => ({ resourcesScales: without(s.resourcesScales ?? {}, id) })),
  select: selection => set(selection),
  edit: (id, field, value) => set(s => ({ edits: { ...s.edits, [id]: { ...s.edits[id], [field]: value } } })),
  clearEdits: id => set(s => ({ edits: without(s.edits, id) })),
  transform: (id, value) => set(s => ({ transforms: { ...s.transforms, [id]: value } })),
  clearTransform: id => set(s => ({ transforms: without(s.transforms, id) })),
}), { name: 'card-forge-assembly-v2' }))
