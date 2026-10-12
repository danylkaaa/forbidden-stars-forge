import { SearchableSelect } from '../../components/SearchableSelect'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, inputClass, selectClass } from '../../components/Field'
import { postOpenAIModels, type Settings } from './api'
import { useSettingsStore } from './store'

// Model picker: once an API key is available (saved, env, or typed into
// the Replace field) the key's image models are fetched and offered as a
// dropdown. Until then — or if the fetch fails — it falls back to free text.
export function ModelSelect({ settings }: { settings: Settings }) {
  const model = useSettingsStore((s) => s.draft?.openai_model ?? '')
  const keyInput = useSettingsStore((s) => s.draft?.openai_api_key_input ?? '')
  const setField = useSettingsStore((s) => s.setField)

  // Debounce the typed key so we don't hit /v1/models per keystroke.
  const [typedKey, setTypedKey] = useState(keyInput.trim())
  useEffect(() => {
    const t = setTimeout(() => setTypedKey(keyInput.trim()), 500)
    return () => clearTimeout(t)
  }, [keyInput])

  const hasKey = typedKey !== '' || settings.openai_api_key_masked !== ''
  const { data, error, isFetching } = useQuery({
    queryKey: ['openai-models', typedKey, settings.openai_api_key_masked],
    queryFn: () => postOpenAIModels(typedKey),
    enabled: hasKey,
    retry: false,
    staleTime: Infinity,
  })

  const models = data?.models ?? []
  // Keep the saved model selectable even if this key doesn't list it.
  const options = model && !models.includes(model) ? [model, ...models] : models

  let hint = 'Add an API key to load available models.'
  if (isFetching) hint = 'Loading models…'
  else if (error) hint = `Couldn't load models: ${error instanceof Error ? error.message : 'request failed'}`
  else if (data && models.length === 0) hint = 'No image models available for this key.'

  return (
    <Field label="Default model">
      {(id) => (
        <>
          {models.length > 0 ? (
            <SearchableSelect
              id={id}
              value={model}
              onChange={(e) => setField('openai_model', e.target.value)}
              className={selectClass}
            >
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </SearchableSelect>
          ) : (
            <>
              <input
                id={id}
                type="text"
                value={model}
                onChange={(e) => setField('openai_model', e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-ink/45 mt-1">{hint}</p>
            </>
          )}
        </>
      )}
    </Field>
  )
}
