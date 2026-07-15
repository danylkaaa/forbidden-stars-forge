import { Button } from '../../components/Button'
import { inputClass } from '../../components/Field'
import { useSettingsStore } from './store'
import type { Settings } from './api'

export function ApiKeyField({ settings }: { settings: Settings }) {
  const editingKey = useSettingsStore((s) => s.editingKey)
  const keyInput = useSettingsStore((s) => s.draft?.openai_api_key_input ?? '')
  const startEditKey = useSettingsStore((s) => s.startEditKey)
  const setField = useSettingsStore((s) => s.setField)

  return (
    <div>
      <span className="block text-xs mb-1 text-ink/70">API key</span>
      {editingKey ? (
        <input
          type="text"
          value={keyInput}
          placeholder="sk-…"
          onChange={(e) => setField('openai_api_key_input', e.target.value)}
          className={`${inputClass} border-accent`}
        />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-h-9 flex items-center px-2.5 font-mono text-[13px] text-ink/70 bg-bg border border-divider rounded-md">
            {settings.openai_api_key_masked || 'Not set'}
          </div>
          <Button variant="primary" type="button" onClick={startEditKey}>
            Replace
          </Button>
        </div>
      )}
      <p className="text-[11px] text-ink/45 mt-1">
        Write-only — never returned in full once saved.
        {settings.openai_api_key_from_env && ' Currently overridden by the OPENAI_API_KEY env var.'}
      </p>
    </div>
  )
}
