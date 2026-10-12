import { ClaudeTextAssist } from '../../components/ClaudeTextAssist'
import { startGenerateDescription } from './api'
import type { DLC } from './dlc'
import { useFactionDraft, useFactionsUi } from './store'

// Claude editing of the faction description (opened by GenerateButton).
export function ClaudeAssistPanel({ intervalMs }: { intervalMs?: number }) {
  const open = useFactionsUi((s) => s.assistOpen)
  const description = useFactionDraft((s) => s.draft?.description ?? '')
  if (!open) return null

  const close = () => useFactionsUi.getState().set({ assistOpen: false })
  return (
    <ClaudeTextAssist
      field="description"
      current={description}
      intervalMs={intervalMs}
      start={(baseline, messages) => {
        const d = useFactionDraft.getState().draft
        return startGenerateDescription(d?.name.trim() ?? '', d?.dlc as DLC, {
          primary_color: d?.primary_color ?? '', texture: d?.texture ?? '', current_description: baseline, messages,
        })
      }}
      onAccept={(text) => {
        useFactionDraft.getState().setField('description', text)
        useFactionsUi.getState().set({ lastGenerated: text, assistOpen: false, showDiff: false })
      }}
      onClose={close}
    />
  )
}
