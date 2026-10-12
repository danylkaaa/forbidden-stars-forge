import { useFactionDraft, useFactionsUi } from './store'

// Opens the Claude assist panel (ClaudeAssistPanel) under the description.
export function GenerateButton() {
  const name = useFactionDraft((s) => s.draft?.name ?? '')
  const hasDescription = useFactionDraft((s) => (s.draft?.description ?? '').trim() !== '')
  const open = useFactionsUi((s) => s.assistOpen)

  return (
    <button type="button" disabled={!name.trim() || open}
      onClick={() => useFactionsUi.getState().set({ assistOpen: true })}
      className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-45">
      {hasDescription ? 'Edit with Claude' : 'Generate with Claude'}
    </button>
  )
}
