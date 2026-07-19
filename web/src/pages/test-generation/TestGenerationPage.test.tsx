import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import { useTestGenUi } from './store'
import type { Generation } from './api'
import TestGenerationPage from './TestGenerationPage'

const factions = [
  { id: 1, name: 'Tau Empire', description: 'blue-grey', dlc: 'Galaxy in Flames', created_at: 'a', updated_at: 'b' },
]
const cardTypes = [
  { id: 1, name: 'combat', description: 'warriors', constraints: 'crimson', template_path: 't.png', openai_file_id: 'file-1', created_at: 'a', updated_at: 'b' },
  { id: 2, name: 'upgrade', description: '', constraints: '', template_path: '', openai_file_id: '', created_at: 'a', updated_at: 'b' },
]
const doneGen: Generation = {
  id: 9, faction_id: 1, card_type_id: 1, mode: 'final', prompt: 'stored prompt', status: 'done',
  image_path: 'generated/gen-9.png', input_tokens: 100, output_tokens: 400,
  cost_usd: 0.19, duration_ms: 78000, error: '', created_at: 'Jul 18',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TestGenerationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useTestGenUi.setState({ factionId: null, cardTypeId: null, mode: 'draft', editingPrompt: false, promptOverride: '', activeGenerationId: null, expandedId: null })
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
    http.get('/api/generations', () => HttpResponse.json([doneGen])),
    http.get('/api/generate/preview', ({ request }) => {
      const url = new URL(request.url)
      const hasFile = url.searchParams.get('card_type_id') === '1'
      return HttpResponse.json({ prompt: 'assembled prompt text', has_file: hasFile, est_draft_usd: 0.01, est_final_usd: 0.19 })
    }),
  )
})

async function selectPair(cardType = 'combat') {
  await userEvent.selectOptions(await screen.findByLabelText('Faction'), '1')
  const ctSelect = screen.getByLabelText('Card Type')
  const option = within(ctSelect).getByRole('option', { name: new RegExp(cardType) })
  await userEvent.selectOptions(ctSelect, (option as HTMLOptionElement).value)
}

test('history renders with cost, duration, mode badge, and session total', async () => {
  renderPage()
  expect(await screen.findByText(/Tau Empire/)).toBeInTheDocument()
  expect(screen.getByText(/\$0\.19/)).toBeInTheDocument()
  expect(screen.getByText(/1m 18s/)).toBeInTheDocument()
  expect(screen.getByText('final')).toBeInTheDocument()
  expect(screen.getByText(/Total: \$0\.19/)).toBeInTheDocument()
})

test('prompt preview loads for a valid pair; generate enabled', async () => {
  renderPage()
  await selectPair()
  expect(await screen.findByText('assembled prompt text')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  expect(screen.getByText(/est\. \$0\.01 per image/)).toBeInTheDocument()
})

test('card type without file shows warning and disables generate', async () => {
  renderPage()
  await selectPair('upgrade')
  expect(await screen.findByText(/no OpenAI file/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Card Types/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
})

test('generate posts, polls to done, and clears pending state', async () => {
  let posted: Record<string, unknown> | null = null
  let polls = 0
  server.use(
    http.post('/api/generate', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...doneGen, id: 10, status: 'pending', image_path: '' }, { status: 201 })
    }),
    http.get('/api/generations/10', () => {
      polls++
      return HttpResponse.json(polls < 2 ? { ...doneGen, id: 10, status: 'pending', image_path: '' } : { ...doneGen, id: 10 })
    }),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByText(/Generating/)).toBeInTheDocument()
  await screen.findByRole('button', { name: 'Generate' }, { timeout: 5000 })
  expect(posted).toMatchObject({ faction_id: 1, card_type_id: 1, mode: 'draft' })
  expect(posted).not.toHaveProperty('prompt_override')
})

test('edit prompt override is sent when toggled', async () => {
  let posted: Record<string, unknown> | null = null
  server.use(
    http.post('/api/generate', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...doneGen, id: 11 }, { status: 201 })
    }),
    http.get('/api/generations/11', () => HttpResponse.json({ ...doneGen, id: 11 })),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  await userEvent.click(screen.getByRole('button', { name: 'Edit prompt' }))
  const ta = screen.getByLabelText('Prompt override')
  await userEvent.clear(ta)
  await userEvent.type(ta, 'my custom')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  const sent = posted as Record<string, unknown> | null
  expect(sent?.prompt_override).toBe('my custom')
})

test('failed generation shows alert', async () => {
  server.use(
    http.post('/api/generate', () => HttpResponse.json({ ...doneGen, id: 12, status: 'pending', image_path: '' }, { status: 201 })),
    http.get('/api/generations/12', () => HttpResponse.json({ ...doneGen, id: 12, status: 'failed', image_path: '', error: 'openai: boom (request id r)' })),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/boom/)
})

test('faction load failure shows alert instead of stuck loading', async () => {
  server.use(
    http.get('/api/factions', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
  )
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to load factions/)
})

test('preview load failure shows alert instead of stuck loading', async () => {
  server.use(
    http.get('/api/generate/preview', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
  )
  renderPage()
  await selectPair()
  expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to load prompt preview.*boom/)
  // selects stay usable
  expect(screen.getByLabelText('Faction')).toBeEnabled()
  expect(screen.getByLabelText('Card Type')).toBeEnabled()
})

test('expanding a history row shows prompt and download link', async () => {
  renderPage()
  await screen.findByText(/Tau Empire/)
  await userEvent.click(screen.getByText(/Tau Empire/))
  expect(await screen.findByText('stored prompt')).toBeInTheDocument()
  const dl = screen.getByRole('link', { name: /Download PNG/ })
  expect(dl).toHaveAttribute('href', '/api/generations/9/image')
})
