import { create } from 'zustand'
import { createDraftFormStore } from '../../lib/draftForm'
import type { CardType } from './api'

export type CardTypeDraft = {
  name: string
  description: string
  constraints: string
  image_size: string
  card_width_mm: string // finished card size in mm, as typed
  card_height_mm: string
  aspect_ratio: string // an element's crop shape beyond 3:1, '' when it is image_size's own shape
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
  assistField: 'description' | 'constraints' | null // open Claude panel
  openCreate: () => void
  openEdit: (ct: CardType) => void
  closeDialog: () => void
  set: (partial: Partial<Omit<CardTypesUiState, 'openCreate' | 'openEdit' | 'closeDialog' | 'set'>>) => void
}

export const useCardTypesUi = create<CardTypesUiState>()((set, get) => {
  // Blob URLs must be revoked before the stagedMeta holding them is dropped,
  // or every staged-then-replaced/discarded template leaks memory.
  const revokeStaged = () => {
    const url = get().stagedMeta?.url
    if (url) URL.revokeObjectURL(url)
  }
  return {
    dialogMode: null,
    editingId: null,
    stagedFile: null,
    stagedMeta: null,
    showDiff: false,
    discardConfirmOpen: false,
    deleteConfirmId: null,
    assistField: null,
    openCreate: () => {
      revokeStaged()
      useCardTypeDraft.getState().open('new', { name: '', description: '', constraints: '', image_size: '', card_width_mm: '63.5', card_height_mm: '88', aspect_ratio: '' })
      set({ dialogMode: 'create', editingId: null, stagedFile: null, stagedMeta: null, showDiff: false, assistField: null })
    },
    openEdit: (ct) => {
      revokeStaged()
      useCardTypeDraft.getState().open(String(ct.id), { name: ct.name, description: ct.description, constraints: ct.constraints, image_size: ct.image_size ?? '', card_width_mm: String(ct.card_width_mm ?? 63.5), card_height_mm: String(ct.card_height_mm ?? 88), aspect_ratio: ct.aspect_ratio ? String(ct.aspect_ratio) : '' })
      set({ dialogMode: 'edit', editingId: ct.id, stagedFile: null, stagedMeta: null, showDiff: false, assistField: null })
    },
    closeDialog: () => {
      revokeStaged()
      useCardTypeDraft.getState().close()
      set({ dialogMode: null, editingId: null, stagedFile: null, stagedMeta: null, showDiff: false, discardConfirmOpen: false, assistField: null })
    },
    set: (partial) => {
      // Replacing or clearing stagedMeta releases the previous blob URL.
      if ('stagedMeta' in partial && partial.stagedMeta?.url !== get().stagedMeta?.url) revokeStaged()
      set(partial)
    },
  }
})
