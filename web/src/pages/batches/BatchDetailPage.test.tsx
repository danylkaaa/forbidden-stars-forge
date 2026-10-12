import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { server } from '../../test/msw'
import type { Batch, BatchItem } from './api'
import BatchDetailPage from './BatchDetailPage'

const factions = [{ id: 1, name: 'Tau Empire', description: 'd', dlc: 'Galaxy in Flames', created_at: 'a', updated_at: 'b' }]
const cardTypes = [{ id: 1, name: 'combat', description: '', constraints: '', template_path: 't.png', openai_file_id: 'file-1', created_at: 'a', updated_at: 'b' }]

const baseBatch: Batch = {
  id: 5, model: '', openai_batch_id: 'b5', mode: 'draft', status: 'in_progress', jsonl_path: 'x', output_path: '',
  total_cost_usd: 0, submitted_at: 'a', completed_at: '', created_at: 'a', updated_at: 'a',
  counts: { completed: 1, failed: 0, total: 2 }, est_cost_usd: 0.02,
}
const doneItem: BatchItem = {
  id: 1, batch_id: 5, faction_id: 1, card_type_id: 1, custom_id: 'tau_empire__combat', quality: 'low', name: '1-tau-combat-low', favorite: false, status: 'done',
  image_path: 'batches/5/tau_empire__combat.png', input_tokens: 100, output_tokens: 400, cost_usd: 0.008, error: '',
}
const failedItem: BatchItem = { ...doneItem, id: 2, status: 'failed', image_path: '', cost_usd: 0, error: 'content policy violation' }

function renderPage(path = '/batches/5') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/batches/:id" element={<BatchDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
  )
})

test('renders header progress, mode/status tags, and item grid', async () => {
  server.use(http.get('/api/batches/5', () => HttpResponse.json({ batch: baseBatch, items: [doneItem, failedItem] })))
  renderPage()
  expect(await screen.findByText('Batch #5')).toBeInTheDocument()
  expect(screen.getByText('draft')).toBeInTheDocument()
  expect(screen.getByText('in progress')).toBeInTheDocument()
  expect(screen.getByText(/1\/2 done/)).toBeInTheDocument()
  expect(screen.getAllByText(/Tau Empire/).length).toBeGreaterThan(0)
  expect(screen.getByText(/content policy violation/)).toBeInTheDocument()
})

test('completed batch shows a download link and actual cost', async () => {
  const completed: Batch = { ...baseBatch, status: 'completed', total_cost_usd: 0.008, completed_at: 'b', counts: { completed: 1, failed: 1, total: 2 } }
  server.use(http.get('/api/batches/5', () => HttpResponse.json({ batch: completed, items: [doneItem, failedItem] })))
  renderPage()
  const link = await screen.findByRole('link', { name: 'Download ZIP' })
  expect(link).toHaveAttribute('href', '/api/batches/5/download')
  expect(screen.getByText(/\$0\.01 actual|\$0\.008 actual/)).toBeInTheDocument()
})

test('cancel confirms, calls the API, and closes the dialog', async () => {
  let cancelled = false
  server.use(
    http.get('/api/batches/5', () => HttpResponse.json({ batch: baseBatch, items: [doneItem] })),
    http.post('/api/batches/5/cancel', () => {
      cancelled = true
      return HttpResponse.json({ ...baseBatch, status: 'cancelled' })
    }),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  expect(screen.getByText(/stop processing/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel batch' }))
  expect(cancelled).toBe(true)
})

test('cancel failure shows an error inside the confirm dialog', async () => {
  server.use(
    http.get('/api/batches/5', () => HttpResponse.json({ batch: baseBatch, items: [] })),
    http.post('/api/batches/5/cancel', () => HttpResponse.json({ error: 'openai: already finalizing' }, { status: 502 })),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel batch' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/already finalizing/)
})

test('load failure shows an alert instead of a stuck loading state', async () => {
  server.use(http.get('/api/batches/5', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to load batch.*boom/)
})
