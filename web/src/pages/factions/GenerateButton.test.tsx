import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../test/msw'
import { useFactionDraft, useFactionsUi } from './store'
import { GenerateButton } from './GenerateButton'

function renderBtn() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <GenerateButton intervalMs={50} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useFactionsUi.setState({ dialogMode: 'create', editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, historyFactionId: null, expandedRevId: null, activeJobId: null })
  useFactionDraft.getState().close()
  useFactionDraft.getState().open('new', { name: 'Tau Empire', dlc: 'Galaxy in Flames', description: '' })
})

test('disabled when name empty', () => {
  useFactionDraft.getState().setField('name', '')
  renderBtn()
  expect(screen.getByRole('button', { name: /Generate with Claude/ })).toBeDisabled()
})

test('successful generation fills description in form state only', async () => {
  let polls = 0
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-1', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-1', () => {
      polls++
      return HttpResponse.json(
        polls < 2
          ? { id: 'job-1', status: 'pending', duration_ms: 0 }
          : { id: 'job-1', status: 'done', result: 'Grim dark aesthetic.', duration_ms: 900 },
      )
    }),
  )
  renderBtn()
  await userEvent.click(screen.getByRole('button', { name: /Generate with Claude/ }))
  expect(screen.getByText(/Generating…/)).toBeInTheDocument()
  await waitFor(() => expect(useFactionDraft.getState().draft?.description).toBe('Grim dark aesthetic.'))
  expect(useFactionsUi.getState().lastGenerated).toBe('Grim dark aesthetic.')
  expect(useFactionsUi.getState().showDiff).toBe(true)
})

test('failed generation shows error', async () => {
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-2', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-2', () =>
      HttpResponse.json({ id: 'job-2', status: 'failed', error: 'claude CLI failed: quota', duration_ms: 10 })),
  )
  renderBtn()
  await userEvent.click(screen.getByRole('button', { name: /Generate with Claude/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('claude CLI failed: quota')
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
  renderBtn()
  const btn = screen.getByRole('button', { name: /Generate with Claude/ })
  const user = userEvent.setup()
  await Promise.all([user.click(btn), user.click(btn)])
  await waitFor(() => expect(useFactionsUi.getState().activeJobId).toBe('job-4'))
  expect(calls).toBe(1)
})

test('cancel button posts cancel', async () => {
  let cancelled = false
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-3', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-3', () => HttpResponse.json({ id: 'job-3', status: 'pending', duration_ms: 0 })),
    http.post('/api/jobs/job-3/cancel', () => { cancelled = true; return HttpResponse.json({ ok: true }) }),
  )
  renderBtn()
  await userEvent.click(screen.getByRole('button', { name: /Generate with Claude/ }))
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel generation' }))
  expect(cancelled).toBe(true)
})
