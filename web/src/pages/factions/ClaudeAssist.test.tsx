import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../test/msw'
import { useFactionDraft, useFactionsUi } from './store'
import { GenerateButton } from './GenerateButton'
import { ClaudeAssistPanel } from './ClaudeAssistPanel'
import type { ChatMessage } from './api'

type GenBody = { name: string; dlc: string; current_description?: string; messages?: ChatMessage[] }

function renderAssist() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <GenerateButton />
      <ClaudeAssistPanel intervalMs={20} />
    </QueryClientProvider>,
  )
}

// Each POST starts a job that finishes immediately with the next reply.
function mockClaude(replies: string[]) {
  const bodies: GenBody[] = []
  server.use(
    http.post('/api/factions/generate-description', async ({ request }) => {
      bodies.push((await request.json()) as GenBody)
      return HttpResponse.json({ job_id: `job-${bodies.length}`, status: 'pending' }, { status: 202 })
    }),
    http.get('/api/jobs/:id', ({ params }) => {
      const n = Number(String(params.id).slice(4))
      return HttpResponse.json({ id: params.id, status: 'done', result: replies[n - 1], duration_ms: 5 })
    }),
  )
  return bodies
}

const panel = () => screen.getByRole('region', { name: 'Claude assistant: description' })

beforeEach(() => {
  useFactionsUi.setState({ dialogMode: 'edit', editingId: 1, lastGenerated: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, historyFactionId: null, expandedRevId: null, assistOpen: false })
  useFactionDraft.getState().close()
  useFactionDraft.getState().open('1', { name: 'Sisters', dlc: 'Symphony of War', primary_color: 'black', texture: 'ceramite', description: 'Black and crimson armor.' })
})

test('disabled when name empty; label reflects edit vs generate', () => {
  renderAssist()
  expect(screen.getByRole('button', { name: 'Edit with Claude' })).toBeEnabled()
  act(() => {
    useFactionDraft.getState().setField('description', '')
    useFactionDraft.getState().setField('name', '')
  })
  expect(screen.getByRole('button', { name: 'Generate with Claude' })).toBeDisabled()
})

test('sends pasted text with the current description; shows diff; accept updates the draft', async () => {
  const bodies = mockClaude(['Black and crimson armor with gold filigree.'])
  renderAssist()
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  await userEvent.type(within(panel()).getByRole('textbox'), 'Add gold filigree')
  await userEvent.click(screen.getByRole('button', { name: 'Send to Claude' }))

  expect(await within(panel()).findByText('Proposed changes')).toBeInTheDocument()
  expect(bodies[0]).toEqual({
    name: 'Sisters', dlc: 'Symphony of War', primary_color: 'black', texture: 'ceramite',
    current_description: 'Black and crimson armor.',
    messages: [{ role: 'user', content: 'Add gold filigree' }],
  })
  // Nothing changes in the form until Accept.
  expect(useFactionDraft.getState().draft?.description).toBe('Black and crimson armor.')

  await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
  expect(useFactionDraft.getState().draft?.description).toBe('Black and crimson armor with gold filigree.')
  expect(useFactionsUi.getState().lastGenerated).toBe('Black and crimson armor with gold filigree.')
  expect(screen.queryByRole('region', { name: 'Claude assistant: description' })).not.toBeInTheDocument()
})

test('adjust replays the full conversation; diff stays against the original', async () => {
  const bodies = mockClaude(['Proposal one.', 'Proposal two.'])
  renderAssist()
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  await userEvent.type(within(panel()).getByRole('textbox'), 'More gothic')
  await userEvent.click(screen.getByRole('button', { name: 'Send to Claude' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
  expect(screen.getByRole('button', { name: 'Send to Claude' })).toBeDisabled()
  await userEvent.type(within(panel()).getByRole('textbox'), 'Shorter')
  await userEvent.click(screen.getByRole('button', { name: 'Send to Claude' }))

  await screen.findByRole('button', { name: 'Accept' })
  expect(bodies[1]).toEqual({
    name: 'Sisters', dlc: 'Symphony of War', primary_color: 'black', texture: 'ceramite',
    current_description: 'Black and crimson armor.',
    messages: [
      { role: 'user', content: 'More gothic' },
      { role: 'assistant', content: 'Proposal one.' },
      { role: 'user', content: 'Shorter' },
    ],
  })
  expect(within(panel()).getByText(/More gothic/)).toBeInTheDocument()
  expect(within(panel()).getByText(/Shorter/)).toBeInTheDocument()
})

test('cancel discards the proposal and keeps the description', async () => {
  mockClaude(['Something else.'])
  renderAssist()
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  await userEvent.click(screen.getByRole('button', { name: 'Send to Claude' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  expect(useFactionsUi.getState().assistOpen).toBe(false)
  expect(useFactionDraft.getState().draft?.description).toBe('Black and crimson armor.')
})

test('failed generation shows error and restores the instructions for retry', async () => {
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-2', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-2', () =>
      HttpResponse.json({ id: 'job-2', status: 'failed', error: 'claude CLI failed: quota', duration_ms: 10 })),
  )
  renderAssist()
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  await userEvent.type(within(panel()).getByRole('textbox'), 'More gold')
  await userEvent.click(screen.getByRole('button', { name: 'Send to Claude' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('claude CLI failed: quota')
  expect(within(panel()).getByRole('textbox')).toHaveValue('More gold')
  // The failed turn was dropped: the next send is a fresh first turn.
  expect(within(panel()).queryByText(/You:/)).not.toBeInTheDocument()
})

test('poll failure clears the stuck job and shows an alert', async () => {
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-6', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-6', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
  )
  renderAssist()
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  await userEvent.click(screen.getByRole('button', { name: 'Send to Claude' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('failed to check generation status: boom')
  expect(screen.getByRole('button', { name: 'Send to Claude' })).toBeEnabled()
})

test('rapid double-click only fires one generate request', async () => {
  let calls = 0
  server.use(
    http.post('/api/factions/generate-description', async () => {
      calls++
      await delay(50)
      return HttpResponse.json({ job_id: 'job-4', status: 'pending' }, { status: 202 })
    }),
    http.get('/api/jobs/job-4', () => HttpResponse.json({ id: 'job-4', status: 'pending', duration_ms: 0 })),
  )
  renderAssist()
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  const btn = screen.getByRole('button', { name: 'Send to Claude' })
  const user = userEvent.setup()
  await Promise.all([user.click(btn), user.click(btn)])
  await screen.findByText('Claude is working on it…')
  await delay(80)
  expect(calls).toBe(1)
})

test('cancel while pending posts cancel', async () => {
  let cancelled = false
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-3', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-3', () => HttpResponse.json({ id: 'job-3', status: 'pending', duration_ms: 0 })),
    http.post('/api/jobs/job-3/cancel', () => { cancelled = true; return HttpResponse.json({ ok: true }) }),
  )
  renderAssist()
  await userEvent.click(screen.getByRole('button', { name: 'Edit with Claude' }))
  await userEvent.click(screen.getByRole('button', { name: 'Send to Claude' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel generation' }))
  await waitFor(() => expect(cancelled).toBe(true))
  expect(useFactionsUi.getState().assistOpen).toBe(false)
})
