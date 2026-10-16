import { useSettingsStore, selectIsDirty } from './store'
import type { Settings } from './api'

const serverSettings: Settings = {
  openai_api_key_masked: 'sk-…34bc',
  openai_api_key_from_env: false,
  openai_model: 'gpt-image-2',
  draft_quality: 'low',
  final_quality: 'high',
  input_fidelity: 'high',
  background: 'auto',
  claude_binary: 'claude',
  claude_model: '',
  claude_effort: '',
  price_table: '{}',
}

beforeEach(() => {
  useSettingsStore.setState({ persisted: null, draft: null, editingKey: false })
})

test('init sets persisted and draft; not dirty', () => {
  useSettingsStore.getState().init(serverSettings)
  expect(selectIsDirty(useSettingsStore.getState())).toBe(false)
  expect(useSettingsStore.getState().draft?.openai_model).toBe('gpt-image-2')
})

test('setField makes store dirty; discard reverts', () => {
  const s = useSettingsStore.getState()
  s.init(serverSettings)
  useSettingsStore.getState().setField('openai_model', 'gpt-image-3')
  expect(selectIsDirty(useSettingsStore.getState())).toBe(true)
  useSettingsStore.getState().discard()
  expect(selectIsDirty(useSettingsStore.getState())).toBe(false)
  expect(useSettingsStore.getState().draft?.openai_model).toBe('gpt-image-2')
})

test('non-empty key input is dirty; markSaved resets', () => {
  useSettingsStore.getState().init(serverSettings)
  useSettingsStore.getState().setField('openai_api_key_input', 'sk-new')
  expect(selectIsDirty(useSettingsStore.getState())).toBe(true)
  useSettingsStore.getState().markSaved({ ...serverSettings, openai_api_key_masked: 'sk-…-new' })
  expect(selectIsDirty(useSettingsStore.getState())).toBe(false)
  expect(useSettingsStore.getState().draft?.openai_api_key_input).toBe('')
})

test('init does not clobber an existing (possibly restored) draft', () => {
  useSettingsStore.getState().init(serverSettings)
  useSettingsStore.getState().setField('claude_binary', '/opt/claude')
  useSettingsStore.getState().init(serverSettings) // e.g. query refetch
  expect(useSettingsStore.getState().draft?.claude_binary).toBe('/opt/claude')
})
