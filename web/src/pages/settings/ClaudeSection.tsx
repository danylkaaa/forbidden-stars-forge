import { Field, inputClass } from '../../components/Field'
import { TestButton } from './TestButton'
import { postTestClaude } from './api'
import { useSettingsStore } from './store'

export function ClaudeSection() {
  const draft = useSettingsStore((s) => s.draft)
  const setField = useSettingsStore((s) => s.setField)
  if (!draft) return null

  return (
    <section className="flex flex-col gap-3.5 p-4 rounded-md bg-surface shadow-[0_0_0_1px_#3f424d]">
      <h2 className="text-[13px] font-medium">Claude CLI</h2>
      <Field label="Binary path">
        {(id) => (
          <input
            id={id}
            type="text"
            value={draft.claude_binary}
            onChange={(e) => setField('claude_binary', e.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <TestButton label="Test Claude CLI" run={postTestClaude} />
    </section>
  )
}
