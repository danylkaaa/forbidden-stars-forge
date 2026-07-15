import { Field, inputClass, selectClass } from '../../components/Field'
import { ApiKeyField } from './ApiKeyField'
import { TestButton } from './TestButton'
import { postTestOpenAI, type Settings } from './api'
import { useSettingsStore, type SettingsDraft } from './store'

export function OpenAISection({ settings }: { settings: Settings }) {
  const draft = useSettingsStore((s) => s.draft)
  const setField = useSettingsStore((s) => s.setField)
  if (!draft) return null

  const text = (key: 'openai_model' | 'image_size', label: string) => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={draft[key]}
          onChange={(e) => setField(key, e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  )

  const select = <K extends 'draft_quality' | 'final_quality' | 'input_fidelity'>(
    key: K,
    label: string,
    options: SettingsDraft[K][],
  ) => (
    <Field label={label}>
      {(id) => (
        <select
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
        </select>
      )}
    </Field>
  )

  return (
    <section className="flex flex-col gap-3.5 p-4 rounded-md bg-surface shadow-[0_0_0_1px_#3f424d]">
      <h2 className="text-[13px] font-medium">OpenAI</h2>
      <ApiKeyField settings={settings} />
      {text('openai_model', 'Model')}
      <div className="grid grid-cols-2 gap-3.5">
        {text('image_size', 'Image size')}
        {select('input_fidelity', 'Input fidelity', ['low', 'high'])}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        {select('draft_quality', 'Draft quality', ['low', 'medium'])}
        {select('final_quality', 'Final quality', ['medium', 'high'])}
      </div>
      <TestButton label="Test OpenAI connection" run={postTestOpenAI} />
    </section>
  )
}
