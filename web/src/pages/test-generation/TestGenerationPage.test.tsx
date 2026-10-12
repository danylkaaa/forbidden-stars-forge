import { render, screen, waitFor, within } from '@testing-library/react'
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
  id: 9, faction_id: 1, card_type_id: 1, mode: 'final', model: '', quality: 'low', name: '1-tau_empire-combat-low', favorite: false, prompt: 'stored prompt', status: 'done',
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
  useTestGenUi.setState({ factionId: null, cardTypeId: null, mode: 'draft', model: '', editingPrompt: false, promptOverride: '', promptAssistOpen: false, activeGenerationId: null, expandedId: null, filterDlcs: [], filterFactionIds: [], filterCardTypeIds: [] })
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

test('pending history row animates and shows live elapsed time instead of cost', async () => {
  const createdAt = new Date(Date.now() - 42_000).toISOString().slice(0, 19).replace('T', ' ')
  server.use(
    http.get('/api/generations', () =>
      HttpResponse.json([{ ...doneGen, status: 'pending', image_path: '', cost_usd: 0, duration_ms: 0, created_at: createdAt }]),
    ),
  )
  renderPage()
  expect(await screen.findByText('generating…')).toBeInTheDocument()
  expect(screen.getByText(/4[2-4]s elapsed/)).toBeInTheDocument()
  expect(screen.getByText(/4[2-4]s elapsed/)).not.toHaveTextContent('$')
})

test('clicking the history thumbnail opens the image popup', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /Open Tau Empire × combat/ }))
  expect(screen.getByRole('dialog', { name: 'Tau Empire × combat' })).toBeInTheDocument()
})

test('pending generation appears in history as soon as it starts', async () => {
  const pendingGen = { ...doneGen, id: 13, status: 'pending', image_path: '', cost_usd: 0, duration_ms: 0 }
  let started = false
  server.use(
    http.post('/api/generate', async () => {
      await new Promise((r) => setTimeout(r, 0))
      started = true
      return HttpResponse.json(pendingGen, { status: 201 })
    }),
    http.get('/api/generations', () => HttpResponse.json(started ? [pendingGen, doneGen] : [doneGen])),
    http.get('/api/generations/13', () => HttpResponse.json(pendingGen)),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  expect(screen.queryByText('generating…')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByText('generating…')).toBeInTheDocument()
})

test('retry submits the same params and prompt as a new generation, keeping the original', async () => {
  let posted: Record<string, unknown> | null = null
  const retried = { ...doneGen, id: 14, status: 'pending', image_path: '', cost_usd: 0, duration_ms: 0 }
  server.use(
    http.post('/api/generate', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(retried, { status: 201 })
    }),
    http.get('/api/generations', () => HttpResponse.json(posted ? [retried, doneGen] : [doneGen])),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Retry generation' }))
  expect(await screen.findByText('generating…')).toBeInTheDocument()
  expect(posted).toEqual({ faction_id: 1, card_type_id: 1, mode: 'final', prompt_override: 'stored prompt' })
  expect(screen.getByText(/\$0\.19/)).toBeInTheDocument() // original row still there
  expect(screen.getAllByRole('button', { name: 'Retry generation' })).toHaveLength(2)
})

test('model override is sent with the generation; default sends none', async () => {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('/api/generate', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ ...doneGen, id: 15 }, { status: 201 })
    }),
    http.get('/api/generations/15', () => HttpResponse.json({ ...doneGen, id: 15 })),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  const model = screen.getByLabelText('Model')
  expect(await within(model).findByRole('option', { name: 'Default (gpt-image-2)' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await within(model).findByRole('option', { name: 'gpt-image-2.5-flare' })
  await userEvent.selectOptions(model, 'gpt-image-2.5-flare')
  await screen.findByRole('button', { name: 'Generate' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(bodies).toHaveLength(2))
  expect(bodies[0]).not.toHaveProperty('model')
  expect(bodies[1]).toMatchObject({ model: 'gpt-image-2.5-flare' })
})

test('history filters by DLC, faction, and card type; DLC narrows the faction picker', async () => {
  server.use(
    http.get('/api/factions', () => HttpResponse.json([
      ...factions,
      { id: 2, name: 'Sisters', description: 'gothic', dlc: 'Symphony of War', created_at: 'a', updated_at: 'b' },
    ])),
    http.get('/api/generations', () => HttpResponse.json([
      { ...doneGen, id: 1, faction_id: 1, card_type_id: 1, cost_usd: 0.1 },
      { ...doneGen, id: 2, faction_id: 2, card_type_id: 1, cost_usd: 0.2 },
      { ...doneGen, id: 3, faction_id: 2, card_type_id: 2, cost_usd: 0.4 },
    ])),
  )
  renderPage()
  const history = async () => (await screen.findAllByRole('button', { name: 'Retry generation' })).length
  expect(await history()).toBe(3)
  expect(screen.getByText('Total: $0.70')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'DLC: All' }))
  await userEvent.click(within(screen.getByRole('group', { name: 'DLC' })).getByLabelText('Symphony of War'))
  expect(await history()).toBe(2)
  expect(screen.getByText('Filtered total: $0.60')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Faction: All' }))
  const factionPicker = screen.getByRole('group', { name: 'Faction' })
  expect(within(factionPicker).queryByLabelText('Tau Empire')).not.toBeInTheDocument()
  expect(within(factionPicker).getByLabelText('Sisters')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Card type: All' }))
  await userEvent.click(within(screen.getByRole('group', { name: 'Card type' })).getByLabelText('upgrade'))
  expect(await history()).toBe(1)
  expect(screen.getByText('1 of 3')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(await history()).toBe(3)
})

test('edit prompt with Claude: starts from the assembled prompt, accept sets the override that gets sent', async () => {
  let assistBody: Record<string, unknown> | null = null
  let posted: Record<string, unknown> | null = null
  server.use(
    http.post('/api/generate/prompt-assist', async ({ request }) => {
      assistBody = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ job_id: 'job-p', status: 'pending' }, { status: 202 })
    }),
    http.get('/api/jobs/job-p', () =>
      HttpResponse.json({ id: 'job-p', status: 'done', result: 'assembled prompt text with fog', duration_ms: 5 })),
    http.post('/api/generate', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...doneGen, id: 16 }, { status: 201 })
    }),
    http.get('/api/generations/16', () => HttpResponse.json({ ...doneGen, id: 16 })),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  expect(screen.getByLabelText('Prompt override')).toHaveValue('assembled prompt text')

  const panel = screen.getByRole('region', { name: 'Claude assistant: prompt' })
  await userEvent.type(within(panel).getByRole('textbox'), 'add fog')
  await userEvent.click(within(panel).getByRole('button', { name: 'Send to Claude' }))
  await userEvent.click(await within(panel).findByRole('button', { name: 'Accept' }, { timeout: 4000 }))

  expect(assistBody).toEqual({ current_prompt: 'assembled prompt text', messages: [{ role: 'user', content: 'add fog' }] })
  expect(screen.getByLabelText('Prompt override')).toHaveValue('assembled prompt text with fog')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(posted).toMatchObject({ prompt_override: 'assembled prompt text with fog' }))
})

test('modify copies the row settings and prompt into the setup form', async () => {
  window.scrollTo = () => {}
  server.use(http.get('/api/generations', () => HttpResponse.json([{ ...doneGen, model: 'gpt-image-2.5-flare' }])))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Modify generation' }))

  expect(screen.getByLabelText('Faction')).toHaveValue('1')
  expect(screen.getByLabelText('Card Type')).toHaveValue('1')
  expect(screen.getByRole('button', { name: 'Final' }).className).toMatch(/text-accent/)
  expect(screen.getByLabelText('Prompt override')).toHaveValue('stored prompt')
  await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue('gpt-image-2.5-flare'))
})
