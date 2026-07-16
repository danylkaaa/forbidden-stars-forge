import { create } from 'zustand'
import { createDraftFormStore } from '../../lib/draftForm'
import type { Faction } from './api'

export type FactionDraft = {
  name: string
  dlc: string
  description: string
}

export const useFactionDraft = createDraftFormStore<FactionDraft>('cardforge:faction-draft')

type FactionsUiState = {
  dialogMode: 'create' | 'edit' | null
  editingId: number | null
  lastGenerated: string | null
  showDiff: boolean
  discardConfirmOpen: boolean
  deleteConfirmId: number | null
  historyFactionId: number | null
  expandedRevId: number | null
  activeJobId: string | null
  openCreate: () => void
  openEdit: (f: Faction) => void
  closeDialog: () => void
  set: (partial: Partial<Omit<FactionsUiState, 'openCreate' | 'openEdit' | 'closeDialog' | 'set'>>) => void
}

export const useFactionsUi = create<FactionsUiState>()((set) => ({
  dialogMode: null,
  editingId: null,
  lastGenerated: null,
  showDiff: false,
  discardConfirmOpen: false,
  deleteConfirmId: null,
  historyFactionId: null,
  expandedRevId: null,
  activeJobId: null,
  openCreate: () => {
    useFactionDraft.getState().open('new', { name: '', dlc: 'Galaxy in Flames', description: '' })
    set({ dialogMode: 'create', editingId: null, lastGenerated: null, showDiff: false, activeJobId: null })
  },
  openEdit: (f) => {
    useFactionDraft.getState().open(String(f.id), { name: f.name, dlc: f.dlc, description: f.description })
    set({ dialogMode: 'edit', editingId: f.id, lastGenerated: null, showDiff: false, activeJobId: null })
  },
  closeDialog: () => {
    useFactionDraft.getState().close()
    set({ dialogMode: null, editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, activeJobId: null })
  },
  set: (partial) => set(partial),
}))
