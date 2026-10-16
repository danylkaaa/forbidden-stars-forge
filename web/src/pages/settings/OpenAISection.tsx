import { SearchableSelect } from '../../components/SearchableSelect'
import { Field, selectClass } from '../../components/Field'
import { ApiKeyField } from './ApiKeyField'
import { ModelSelect } from './ModelSelect'
import { TestButton } from './TestButton'
import { postTestOpenAI, type Settings } from './api'
import { useSettingsStore, type SettingsDraft } from './store'

export function OpenAISection({ settings }: { settings: Settings }) {
  const draft = useSettingsStore((s) => s.draft)
  const setField = useSettingsStore((s) => s.setField)
  if (!draft) return null

  const select = <K extends 'draft_quality' | 'final_quality' | 'input_fidelity' | 'background'>(
    key: K,
    label: string,
    options: SettingsDraft[K][],
  ) => (
    <Field label={label}>
      {(id) => (
        <SearchableSelect
          id={id}
          value={draft[key]}
          onChange={(e) => setField(key, e.target.value as SettingsDraft[K])}
          className={selectClass}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </SearchableSelect>
      )}
    </Field>
  )

  return (
    <section className="flex flex-col gap-3.5 p-4 rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <h2 className="text-[13px] font-medium">OpenAI</h2>
      <ApiKeyField settings={settings} />
      <ModelSelect settings={settings} />
      <div className="grid grid-cols-2 gap-3.5">
        {select('background', 'Background', ['auto', 'opaque', 'transparent'])}
      </div>
      {draft.background === 'transparent' &&
        (draft.openai_model === 'gpt-image-2' || draft.openai_model.startsWith('gpt-image-2-')) && (
        <p className="text-[11px] text-ink/45 -mt-2">
          Transparent backgrounds are in preview for gpt-image-2.
        </p>
      )}
      {!draft.openai_model.startsWith('gpt-image-2') && (
        <div className="grid grid-cols-2 gap-3.5">
          {select('input_fidelity', 'Input fidelity', ['low', 'high'])}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5">
        {select('draft_quality', 'Draft quality', ['low', 'medium'])}
        {select('final_quality', 'Final quality', ['medium', 'high'])}
      </div>
      <TestButton label="Test OpenAI connection" run={postTestOpenAI} />
    </section>
  )
}
