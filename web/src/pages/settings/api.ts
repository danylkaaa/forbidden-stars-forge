import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'

export type Settings = {
  openai_api_key_masked: string
  openai_api_key_from_env: boolean
  openai_model: string
  image_size: string
  draft_quality: 'low' | 'medium'
  final_quality: 'medium' | 'high'
  input_fidelity: 'low' | 'high'
  claude_binary: string
  price_table: string
}

export type SettingsUpdate = Omit<Settings, 'openai_api_key_masked' | 'openai_api_key_from_env'> & {
  openai_api_key: string // empty string = leave unchanged (write-only key)
}

export type TestResult = { ok: boolean; message: string }

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => apiGet<Settings>('/api/settings') })
}

export function putSettings(u: SettingsUpdate): Promise<Settings> {
  return apiSend<Settings>('PUT', '/api/settings', u)
}

export function postTestOpenAI(): Promise<TestResult> {
  return apiSend<TestResult>('POST', '/api/settings/test-openai', {})
}

export function postTestClaude(): Promise<TestResult> {
  return apiSend<TestResult>('POST', '/api/settings/test-claude', {})
}
