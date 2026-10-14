import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { server } from '../../test/msw'
import { useBatchWizard } from './store'
import NewBatchPage from './NewBatchPage'

const factions = [
  { id: 1, name: 'Tau Empire', description: 'd', dlc: 'Galaxy in Flames', created_at: 'a', updated_at: 'b' },
]
const cardTypes = [
  { id: 1, name: 'combat', description: '', constraints: '', template_path: 't.png', openai_file_id: 'file-1', created_at: 'a', updated_at: 'b' },
  { id: 2, name: 'events', description: '', constraints: '', template_path: '', openai_file_id: '', created_at: 'a', updated_at: 'b' },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/batches/new']}>
        <Routes>
          <Route path="/batches/new" element={<NewBatchPage />} />
          <Route path="/batches/:id" element={<div>batch detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useBatchWizard.getState().reset()
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
  )
})

test('card type without a file cannot be selected', async () => {
  renderPage()
  expect(await screen.findByLabelText(/events/)).toBeDisabled()
})

test('scope -> preview -> submit navigates to the new batch', async () => {
  server.use(
    http.post('/api/batches/preview', () => HttpResponse.json({ jsonl: '{"custom_id":"tau_empire__combat"}\n', count: 1, est_cost: 0.005 })),
    http.post('/api/batches', () => HttpResponse.json({
      id: 42, openai_batch_id: 'b42', mode: 'draft', status: 'submitted', jsonl_path: 'x', output_path: '',
      total_cost_usd: 0, submitted_at: 'a', completed_at: '', created_at: 'a', updated_at: 'a',
      counts: { completed: 0, failed: 0, total: 1 }, est_cost_usd: 0.005,
    }, { status: 201 })),
  )
  renderPage()
  await userEvent.click(await screen.findByLabelText('Tau Empire'))
  await userEvent.click(screen.getByLabelText('combat'))
  await userEvent.click(screen.getByRole('button', { name: 'Next: Preview' }))
  expect(await screen.findByText(/1 request/)).toBeInTheDocument()
  expect(screen.getByText(/tau_empire__combat/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Submit batch to OpenAI' }))
  expect(await screen.findByText('batch detail page')).toBeInTheDocument()
})

test('preview failure shows an error and stays on the scope step', async () => {
  server.use(http.post('/api/batches/preview', () => HttpResponse.json({ error: 'card type has no OpenAI file' }, { status: 400 })))
  renderPage()
  await userEvent.click(await screen.findByLabelText('Tau Empire'))
  await userEvent.click(screen.getByLabelText('combat'))
  await userEvent.click(screen.getByRole('button', { name: 'Next: Preview' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/no OpenAI file/)
  expect(screen.getByRole('button', { name: 'Next: Preview' })).toBeInTheDocument()
})
