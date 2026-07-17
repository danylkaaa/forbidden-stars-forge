import { create } from 'zustand'
import { createDraftFormStore } from '../../lib/draftForm'
import type { CardType } from './api'

export type CardTypeDraft = {
  name: string
  description: string
  constraints: string
}

export const useCardTypeDraft = createDraftFormStore<CardTypeDraft>('cardforge:card-type-draft')

type CardTypesUiState = {
  dialogMode: 'create' | 'edit' | null
  editingId: number | null
  stagedFile: File | null
  stagedMeta: { w: number; h: number; url: string } | null
  showDiff: boolean
  discardConfirmOpen: boolean
  deleteConfirmId: number | null
  openCreate: () => void
  openEdit: (ct: CardType) => void
  closeDialog: () => void
  set: (partial: Partial<Omit<CardTypesUiState, 'openCreate' | 'openEdit' | 'closeDialog' | 'set'>>) => void
}

export const useCardTypesUi = create<CardTypesUiState>()((set) => ({
  dialogMode: null,
  editingId: null,
  stagedFile: null,
  stagedMeta: null,
  showDiff: false,
  discardConfirmOpen: false,
  deleteConfirmId: null,
  openCreate: () => {
    useCardTypeDraft.getState().open('new', { name: '', description: '', constraints: '' })
    set({ dialogMode: 'create', editingId: null, stagedFile: null, stagedMeta: null, showDiff: false })
  },
  openEdit: (ct) => {
    useCardTypeDraft.getState().open(String(ct.id), { name: ct.name, description: ct.description, constraints: ct.constraints })
    set({ dialogMode: 'edit', editingId: ct.id, stagedFile: null, stagedMeta: null, showDiff: false })
  },
  closeDialog: () => {
    useCardTypeDraft.getState().close()
    set({ dialogMode: null, editingId: null, stagedFile: null, stagedMeta: null, showDiff: false, discardConfirmOpen: false })
  },
  set: (partial) => set(partial),
}))
