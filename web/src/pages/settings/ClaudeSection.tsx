import { Field, inputClass, selectClass } from '../../components/Field'
import { TestButton } from './TestButton'
import { postTestClaude, type ClaudeEffort } from './api'
import { useSettingsStore } from './store'

// Suggestions only — the CLI accepts any alias or full model name.
const MODEL_SUGGESTIONS = ['fable', 'opus', 'sonnet', 'haiku', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
const EFFORTS: ClaudeEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function ClaudeSection() {
  const draft = useSettingsStore((s) => s.draft)
  const setField = useSettingsStore((s) => s.setField)
  if (!draft) return null

  return (
    <section className="flex flex-col gap-3.5 p-4 rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
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
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Claude model">
          {(id) => (
            <>
              <input
                id={id}
                type="text"
                list="claude-model-suggestions"
                value={draft.claude_model}
                placeholder="CLI default"
                onChange={(e) => setField('claude_model', e.target.value)}
                className={inputClass}
              />
              <datalist id="claude-model-suggestions">
                {MODEL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Effort">
          {(id) => (
            <select
              id={id}
              value={draft.claude_effort}
              onChange={(e) => setField('claude_effort', e.target.value as ClaudeEffort)}
              className={selectClass}
            >
              <option value="">CLI default</option>
              {EFFORTS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
        </Field>
      </div>
      <p className="-mt-2 text-[11px] text-ink/45">
        Passed as <code>--model</code> / <code>--effort</code> to every Claude call. Alias (opus, sonnet…) or full model name.
      </p>
      <TestButton label="Test Claude CLI" run={postTestClaude} />
    </section>
  )
}
