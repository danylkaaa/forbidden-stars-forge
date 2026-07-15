import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Settings } from './api'

export type SettingsDraft = {
  openai_api_key_input: string
  openai_model: string
  image_size: string
  draft_quality: 'low' | 'medium'
  final_quality: 'medium' | 'high'
  input_fidelity: 'low' | 'high'
  claude_binary: string
}

type SettingsState = {
  persisted: SettingsDraft | null
  draft: SettingsDraft | null
  editingKey: boolean
  init: (s: Settings) => void
  setField: <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => void
  startEditKey: () => void
  discard: () => void
  markSaved: (s: Settings) => void
}

const fromSettings = (s: Settings): SettingsDraft => ({
  openai_api_key_input: '',
  openai_model: s.openai_model,
  image_size: s.image_size,
  draft_quality: s.draft_quality,
  final_quality: s.final_quality,
  input_fidelity: s.input_fidelity,
  claude_binary: s.claude_binary,
})

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      persisted: null,
      draft: null,
      editingKey: false,
      // Sets the server snapshot; keeps any existing draft (it may have
      // been restored from localStorage before the query resolved).
      init: (s) => {
        const snap = fromSettings(s)
        set((st) => ({ persisted: snap, draft: st.draft ?? { ...snap } }))
      },
      setField: (key, value) =>
        set((st) => (st.draft ? { draft: { ...st.draft, [key]: value } } : {})),
      startEditKey: () => set({ editingKey: true }),
      discard: () =>
        set((st) => ({
          draft: st.persisted ? { ...st.persisted } : null,
          editingKey: false,
        })),
      markSaved: (s) => {
        const snap = fromSettings(s)
        set({ persisted: snap, draft: { ...snap }, editingKey: false })
      },
    }),
    {
      name: 'cardforge:settings-draft',
      // Only the unsaved draft persists; the snapshot always comes fresh
      // from the server (explicit-save principle: DB is source of truth).
      partialize: (st) => ({ draft: st.draft, editingKey: st.editingKey }),
    },
  ),
)

export function selectIsDirty(st: SettingsState): boolean {
  if (!st.persisted || !st.draft) return false
  if (st.draft.openai_api_key_input !== '') return true
  const p = st.persisted
  const d = st.draft
  return (
    d.openai_model !== p.openai_model ||
    d.image_size !== p.image_size ||
    d.draft_quality !== p.draft_quality ||
    d.final_quality !== p.final_quality ||
    d.input_fidelity !== p.input_fidelity ||
    d.claude_binary !== p.claude_binary
  )
}
