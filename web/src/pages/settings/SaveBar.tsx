import { useActionState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { putSettings, type Settings } from './api'
import { useSettingsStore, selectIsDirty } from './store'

export function SaveBar({ settings }: { settings: Settings }) {
  const dirty = useSettingsStore(selectIsDirty)
  const discard = useSettingsStore((s) => s.discard)
  const queryClient = useQueryClient()

  const [result, saveAction, pending] = useActionState(
    async (): Promise<{ error: string | null }> => {
      const { draft, markSaved } = useSettingsStore.getState()
      if (!draft) return { error: null }
      try {
        const saved = await putSettings({
          openai_api_key: draft.openai_api_key_input,
          openai_model: draft.openai_model,
          image_size: draft.image_size,
          draft_quality: draft.draft_quality,
          final_quality: draft.final_quality,
          input_fidelity: draft.input_fidelity,
          background: draft.background,
          claude_binary: draft.claude_binary,
          claude_model: draft.claude_model,
          claude_effort: draft.claude_effort,
          price_table: settings.price_table, // pass through until pricing UI (M6)
        })
        markSaved(saved)
        queryClient.setQueryData(['settings'], saved)
        return { error: null }
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Save failed' }
      }
    },
    { error: null },
  )

  return (
    <form action={saveAction} className="flex items-center justify-end gap-2">
      {result.error && (
        <p role="alert" className="text-danger text-sm mr-auto">
          {result.error}
        </p>
      )}
      {dirty && (
        <Button type="button" onClick={discard}>
          Discard
        </Button>
      )}
      <Button variant="primary" type="submit" disabled={!dirty || pending}>
        {pending ? 'Saving…' : 'Save Settings'}
      </Button>
    </form>
  )
}
