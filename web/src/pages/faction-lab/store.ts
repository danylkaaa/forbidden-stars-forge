import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The faction aesthetic fields the lab experiments with.
export type LabFields = { primary_color: string; texture: string; description: string }

export const sameFields = (a: LabFields, b: LabFields) =>
  a.primary_color === b.primary_color && a.texture === b.texture && a.description === b.description

// The card type text the lab can experiment with.
export type CtFields = { description: string; constraints: string }

export const sameCt = (a: CtFields, b: CtFields) => a.description === b.description && a.constraints === b.constraints

type LabState = {
  factionId: number | null
  cardTypeId: number | null
  mode: 'draft' | 'final'
  model: string // '' = Settings default
  // Unsaved edits per faction; nothing reaches the server until Save.
  drafts: Record<number, LabFields>
  // Fields each lab generation was made with, so a result can be restored.
  snapshots: Record<number, LabFields>
  // Unsaved card type edits per card type, and their per-generation snapshots.
  ctDrafts: Record<number, CtFields>
  ctSnapshots: Record<number, CtFields>
  set: (p: Partial<Pick<LabState, 'factionId' | 'cardTypeId' | 'mode' | 'model'>>) => void
  setDraft: (factionId: number, fields: LabFields) => void
  clearDraft: (factionId: number) => void
  snapshot: (generationId: number, fields: LabFields, ct: CtFields) => void
  setCtDraft: (cardTypeId: number, fields: CtFields) => void
  clearCtDraft: (cardTypeId: number) => void
}

// Persisted so experiments survive a reload.
export const useFactionLab = create<LabState>()(
  persist(
    (set) => ({
      factionId: null,
      cardTypeId: null,
      mode: 'draft',
      model: '',
      drafts: {},
      snapshots: {},
      ctDrafts: {},
      ctSnapshots: {},
      set: (p) => set(p),
      setDraft: (id, fields) => set((s) => ({ drafts: { ...s.drafts, [id]: fields } })),
      clearDraft: (id) => set((s) => {
        const drafts = { ...s.drafts }
        delete drafts[id]
        return { drafts }
      }),
      snapshot: (genId, fields, ct) => set((s) => ({
        snapshots: { ...s.snapshots, [genId]: fields },
        ctSnapshots: { ...s.ctSnapshots, [genId]: ct },
      })),
      setCtDraft: (id, fields) => set((s) => ({ ctDrafts: { ...s.ctDrafts, [id]: fields } })),
      clearCtDraft: (id) => set((s) => {
        const ctDrafts = { ...s.ctDrafts }
        delete ctDrafts[id]
        return { ctDrafts }
      }),
    }),
    { name: 'cardforge:faction-lab' },
  ),
)
