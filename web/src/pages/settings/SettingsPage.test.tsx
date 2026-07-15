import { render, screen } from '@testing-library/react'
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
  image_size: '816x1104',
  draft_quality: 'low',
  final_quality: 'high',
  input_fidelity: 'high',
  claude_binary: 'claude',
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
  server.use(http.get('/api/settings', () => HttpResponse.json(base)))
})

test('renders loaded settings; no dirty badge', async () => {
  renderPage()
  expect(await screen.findByDisplayValue('gpt-image-2')).toBeInTheDocument()
  expect(screen.getByText('sk-…34bc')).toBeInTheDocument()
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('editing a field shows dirty badge; discard reverts', async () => {
  renderPage()
  const model = await screen.findByLabelText('Model')
  await userEvent.clear(model)
  await userEvent.type(model, 'gpt-image-3')
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
      return HttpResponse.json({ ...base, openai_model: 'gpt-image-3' })
    }),
  )
  renderPage()
  const model = await screen.findByLabelText('Model')
  await userEvent.clear(model)
  await userEvent.type(model, 'gpt-image-3')
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  await screen.findByDisplayValue('gpt-image-3')
  expect(putBody).toMatchObject({ openai_model: 'gpt-image-3', openai_api_key: '' })
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
  const model = await screen.findByLabelText('Model')
  await userEvent.type(model, 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('draft_quality must be low or medium')
})
