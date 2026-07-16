import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DraftFormState<T extends Record<string, string>> = {
  entityKey: string | null
  persisted: T | null
  draft: T | null
  open: (entityKey: string, snapshot: T) => void
  setField: (key: keyof T & string, value: string) => void
  discard: () => void
  markSaved: (snapshot: T) => void
  close: () => void
}

// Draft-form store factory (spec §5): persisted snapshot vs editable draft,
// localStorage persistence of the unsaved draft only. The persisted snapshot
// always comes fresh from the server via open()/markSaved().
export function createDraftFormStore<T extends Record<string, string>>(storageKey: string) {
  return create<DraftFormState<T>>()(
    persist(
      (set, get) => ({
        entityKey: null,
        persisted: null,
        draft: null,
        open: (entityKey, snapshot) => {
          const st = get()
          // Restore a stored draft only if it belongs to the same entity.
          const keep = st.entityKey === entityKey && st.draft !== null
          set({
            entityKey,
            persisted: { ...snapshot },
            draft: keep ? st.draft : { ...snapshot },
          })
        },
        setField: (key, value) =>
          set((st) => (st.draft ? { draft: { ...st.draft, [key]: value } } : {})),
        discard: () =>
          set((st) => ({ draft: st.persisted ? { ...st.persisted } : null })),
        markSaved: (snapshot) =>
          set({ persisted: { ...snapshot }, draft: { ...snapshot } }),
        close: () => set({ entityKey: null, persisted: null, draft: null }),
      }),
      {
        name: storageKey,
        partialize: (st) => ({ entityKey: st.entityKey, draft: st.draft }),
      },
    ),
  )
}

export function isDraftDirty<T extends Record<string, string>>(st: {
  persisted: T | null
  draft: T | null
}): boolean {
  if (!st.persisted || !st.draft) return false
  return Object.keys(st.persisted).some((k) => st.persisted![k] !== st.draft![k])
}
