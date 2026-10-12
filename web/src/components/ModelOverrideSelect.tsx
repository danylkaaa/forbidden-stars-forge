import { SearchableSelect } from './SearchableSelect'
import { useQuery } from '@tanstack/react-query'
import { Field, selectClass } from './Field'
import { postOpenAIModels, useSettings } from '../pages/settings/api'

// Per-run image model picker. '' means "use the Settings default model".
export function ModelOverrideSelect({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const { data: settings } = useSettings()
  const masked = settings?.openai_api_key_masked ?? ''
  // Same key shape as the Settings ModelSelect so the list is shared/cached.
  const { data } = useQuery({
    queryKey: ['openai-models', '', masked],
    queryFn: () => postOpenAIModels(''),
    enabled: settings !== undefined,
    retry: false,
    staleTime: Infinity,
  })
  const defaultModel = settings?.openai_model ?? ''
  const models = data?.models ?? []
  const options = value && !models.includes(value) ? [value, ...models] : models

  return (
    <Field label="Model">
      {(id) => (
        <SearchableSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          <option value="">Default{defaultModel ? ` (${defaultModel})` : ''}</option>
          {options.filter((m) => m !== '').map((m) => <option key={m} value={m}>{m}</option>)}
        </SearchableSelect>
      )}
    </Field>
  )
}
