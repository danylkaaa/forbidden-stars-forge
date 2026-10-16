import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useSettingsStore } from './store'
import type { Settings } from './api'
import SettingsPage from './SettingsPage'

const base: Settings = {
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useSettingsStore.setState({ persisted: null, draft: null, editingKey: false })
  server.use(
    http.get('/api/settings', () => HttpResponse.json(base)),
    http.post('/api/settings/openai-models', () =>
      HttpResponse.json({ models: ['gpt-image-2', 'gpt-image-2.5-sunburst'] }),
    ),
  )
})

const modelSelect = () => screen.findByRole('combobox', { name: 'Default model' })

test('renders loaded settings; no dirty badge', async () => {
  renderPage()
  expect(await screen.findByDisplayValue('gpt-image-2')).toBeInTheDocument()
  expect(screen.getByText('sk-…34bc')).toBeInTheDocument()
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('editing a field shows dirty badge; discard reverts', async () => {
  renderPage()
  await userEvent.selectOptions(await modelSelect(), 'gpt-image-2.5-sunburst')
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(screen.getByDisplayValue('gpt-image-2')).toBeInTheDocument()
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('save PUTs update and clears dirty state', async () => {
  let putBody: Record<string, unknown> | null = null
  server.use(
    http.put('/api/settings', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...base, openai_model: 'gpt-image-2.5-sunburst', background: 'transparent' })
    }),
  )
  renderPage()
  await userEvent.selectOptions(await modelSelect(), 'gpt-image-2.5-sunburst')
  await userEvent.selectOptions(screen.getByLabelText('Background'), 'transparent')
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  await screen.findByDisplayValue('gpt-image-2.5-sunburst')
  expect(putBody).toMatchObject({
    openai_model: 'gpt-image-2.5-sunburst',
    background: 'transparent',
    openai_api_key: '',
  })
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('replace key flow sends new key', async () => {
  server.use(
    http.put('/api/settings', () =>
      HttpResponse.json({ ...base, openai_api_key_masked: 'sk-…-new' }),
    ),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Replace' }))
  const keyInput = screen.getByPlaceholderText('sk-…')
  expect(screen.getByLabelText('API key')).toBe(keyInput)
  await userEvent.type(keyInput, 'sk-brand-new')
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  expect(await screen.findByText('sk-…-new')).toBeInTheDocument()
})

test('stub test buttons show canned result', async () => {
  server.use(
    http.post('/api/settings/test-openai', () =>
      HttpResponse.json({ ok: true, message: 'stub: real connection test arrives with the Card Types milestone' }),
    ),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Test OpenAI connection' }))
  expect(await screen.findByText(/stub: real connection test/)).toBeInTheDocument()
})

test('failed save shows error banner', async () => {
  server.use(
    http.put('/api/settings', () =>
      HttpResponse.json({ error: 'draft_quality must be low or medium' }, { status: 400 }),
    ),
  )
  renderPage()
  await userEvent.selectOptions(await screen.findByLabelText('Background'), 'opaque')
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('draft_quality must be low or medium')
})

test('model falls back to free text when models cannot be loaded', async () => {
  server.use(
    http.post('/api/settings/openai-models', () =>
      HttpResponse.json({ error: 'openai: Incorrect API key provided' }, { status: 502 }),
    ),
  )
  renderPage()
  expect(await screen.findByText(/Couldn't load models: openai: Incorrect API key/)).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Default model' })).toHaveValue('gpt-image-2')
})

test('typing a new key reloads models with that key', async () => {
  const keys: string[] = []
  server.use(
    http.post('/api/settings/openai-models', async ({ request }) => {
      const { api_key } = (await request.json()) as { api_key: string }
      keys.push(api_key)
      return HttpResponse.json({ models: api_key ? ['gpt-image-2.5-flare'] : ['gpt-image-2'] })
    }),
  )
  renderPage()
  await modelSelect()
  await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
  await userEvent.type(screen.getByPlaceholderText('sk-…'), 'sk-other')
  expect(await screen.findByRole('option', { name: 'gpt-image-2.5-flare' })).toBeInTheDocument()
  expect(keys).toEqual(['', 'sk-other'])
})

test('input fidelity is hidden for gpt-image-2 family models', async () => {
  renderPage()
  await modelSelect()
  expect(screen.queryByLabelText('Input fidelity')).not.toBeInTheDocument()
})

test('claude model and effort are saved', async () => {
  let putBody: Record<string, unknown> | null = null
  server.use(
    http.put('/api/settings', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...base, claude_model: 'opus', claude_effort: 'high' })
    }),
  )
  renderPage()
  await userEvent.type(await screen.findByLabelText('Claude model'), 'opus')
  await userEvent.selectOptions(screen.getByLabelText('Effort'), 'high')
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  await waitFor(() => expect(putBody).toMatchObject({ claude_model: 'opus', claude_effort: 'high' }))
})

test('reset all cards asks first, then deletes every card', async () => {
  let deleted = 0
  server.use(http.delete('/api/cards', () => { deleted++; return HttpResponse.json({ deleted: 4 }) }))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /Reset all cards/ }))
  const dialog = screen.getByRole('dialog', { name: 'Reset all cards?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(deleted).toBe(0)
  await userEvent.click(screen.getByRole('button', { name: /Reset all cards/ }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Reset all cards?' })).getByRole('button', { name: 'Delete all cards' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Removed 4 cards.')
  expect(deleted).toBe(1)
})
