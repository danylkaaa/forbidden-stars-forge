import { create } from 'zustand'
import type { BatchMode } from './api'

type BatchWizardState = {
  step: 'scope' | 'preview'
  factionIds: number[]
  cardTypeIds: number[]
  mode: BatchMode
  toggleFaction: (id: number) => void
  toggleCardType: (id: number) => void
  setAllFactions: (ids: number[], on: boolean) => void
  setAllCardTypes: (ids: number[], on: boolean) => void
  reset: () => void
  set: (partial: Partial<Pick<BatchWizardState, 'step' | 'mode'>>) => void
}

const initial = { step: 'scope' as const, factionIds: [] as number[], cardTypeIds: [] as number[], mode: 'draft' as BatchMode }

function toggle(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

function setAll(ids: number[], targets: number[], on: boolean): number[] {
  return on ? Array.from(new Set([...ids, ...targets])) : ids.filter((x) => !targets.includes(x))
}

export const useBatchWizard = create<BatchWizardState>()((set, get) => ({
  ...initial,
  toggleFaction: (id) => set({ factionIds: toggle(get().factionIds, id) }),
  toggleCardType: (id) => set({ cardTypeIds: toggle(get().cardTypeIds, id) }),
  setAllFactions: (ids, on) => set({ factionIds: setAll(get().factionIds, ids, on) }),
  setAllCardTypes: (ids, on) => set({ cardTypeIds: setAll(get().cardTypeIds, ids, on) }),
  reset: () => set(initial),
  set: (partial) => set(partial),
}))
