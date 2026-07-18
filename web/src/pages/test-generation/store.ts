import { create } from 'zustand'

type TestGenUiState = {
  factionId: number | null
  cardTypeId: number | null
  mode: 'draft' | 'final'
  editingPrompt: boolean
  promptOverride: string
  activeGenerationId: number | null
  expandedId: number | null
  set: (partial: Partial<Omit<TestGenUiState, 'set'>>) => void
}

export const useTestGenUi = create<TestGenUiState>()((set) => ({
  factionId: null,
  cardTypeId: null,
  mode: 'draft',
  editingPrompt: false,
  promptOverride: '',
  activeGenerationId: null,
  expandedId: null,
  set: (partial) => set(partial),
}))
