import { create } from 'zustand'
import type { DLC } from '../factions/dlc'

type TestGenUiState = {
  factionId: number | null
  cardTypeId: number | null
  mode: 'draft' | 'final'
  model: string // '' = Settings default
  editingPrompt: boolean
  promptOverride: string
  promptAssistOpen: boolean // Claude panel for the prompt override
  activeGenerationId: number | null
  expandedId: number | null
  // History filters; empty = no filter.
  filterDlcs: DLC[]
  filterFactionIds: number[]
  filterCardTypeIds: number[]
  set: (partial: Partial<Omit<TestGenUiState, 'set'>>) => void
}

export const useTestGenUi = create<TestGenUiState>()((set) => ({
  factionId: null,
  cardTypeId: null,
  mode: 'draft',
  model: '',
  editingPrompt: false,
  promptOverride: '',
  promptAssistOpen: false,
  activeGenerationId: null,
  expandedId: null,
  filterDlcs: [],
  filterFactionIds: [],
  filterCardTypeIds: [],
  set: (partial) => set(partial),
}))
