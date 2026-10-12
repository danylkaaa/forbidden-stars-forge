import { create } from 'zustand'
import { createDraftFormStore } from '../../lib/draftForm'
import type { Faction } from './api'

export type FactionDraft = {
  name: string
  dlc: string
  primary_color: string
  texture: string
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
  assistOpen: boolean // Claude description panel
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
  assistOpen: false,
  openCreate: () => {
    useFactionDraft.getState().open('new', { name: '', dlc: 'Galaxy in Flames', primary_color: '', texture: '', description: '' })
    set({ dialogMode: 'create', editingId: null, lastGenerated: null, showDiff: false, assistOpen: false })
  },
  openEdit: (f) => {
    useFactionDraft.getState().open(String(f.id), { name: f.name, dlc: f.dlc, primary_color: f.primary_color, texture: f.texture, description: f.description })
    set({ dialogMode: 'edit', editingId: f.id, lastGenerated: null, showDiff: false, assistOpen: false })
  },
  closeDialog: () => {
    useFactionDraft.getState().close()
    set({ dialogMode: null, editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, assistOpen: false })
  },
  set: (partial) => set(partial),
}))
