import { emptyAssembly, type Assembly } from './api'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CardDraft } from '../cards/model'
import { defaultLayout, type Layout, type Layer, type Placement } from './model'
type State = {
  cardId: string; imageKey: string; overlayId: string
  assemblies: Record<string, Assembly>
  assembly: (id: string, value: Assembly) => void
  clearAssembly: (id: string) => void
  edits: Record<string, CardDraft>; layouts: Record<string, Layout>
  select: (selection: Partial<Pick<State, 'cardId' | 'imageKey' | 'overlayId'>>) => void
  edit: (id: string, field: string, value: string) => void
  clearEdits: (id: string) => void
  position: (scope: string, layer: Layer, patch: Partial<Placement>, base?: Layout) => void
  clearLayout: (scope: string) => void
  resetLayout: (id: string) => void
}
export const useAssembly = create<State>()(persist((set) => ({
  cardId: '', imageKey: '', overlayId: 'auto', edits: {}, layouts: {}, assemblies: {},
  assembly: (id, value) => set(s => ({ assemblies: { ...s.assemblies, [id]: { ...emptyAssembly(), ...value } } })),
  clearAssembly: id => set(s => { const assemblies = { ...s.assemblies }; delete assemblies[id]; return { assemblies } }),
  select: selection => set(selection),
  edit: (id, field, value) => set(s => ({ edits: { ...s.edits, [id]: { ...s.edits[id], [field]: value } } })),
  clearEdits: id => set(s => { const edits = { ...s.edits }; delete edits[id]; return { edits } }),
  clearLayout: scope => set(s => { const layouts = { ...s.layouts }; delete layouts[scope]; return { layouts } }),
  position: (id, layer, patch, base) => set(s => { const layout = s.layouts[id] ?? base ?? defaultLayout(); return { layouts: { ...s.layouts, [id]: { ...layout, [layer]: { ...layout[layer], ...patch, ...('y' in patch ? { autoY: false } : {}) } } } } }),
  resetLayout: id => set(s => ({ layouts: { ...s.layouts, [id]: defaultLayout() } })),
}), { name: 'card-forge-assembly-v1' }))
