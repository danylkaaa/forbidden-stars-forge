import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import BatchesPage from './BatchesPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BatchesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('renders batch rows with status and progress', async () => {
  server.use(
    http.get('/api/batches', () => HttpResponse.json([
      {
        id: 3, openai_batch_id: 'b3', mode: 'final', status: 'completed', jsonl_path: 'x', output_path: 'y',
        total_cost_usd: 0.42, submitted_at: 'a', completed_at: 'b', created_at: 'a', updated_at: 'b',
        counts: { completed: 2, failed: 0, total: 2 }, est_cost_usd: 0.38,
      },
    ])),
  )
  renderPage()
  expect(await screen.findByText('Batch #3')).toBeInTheDocument()
  expect(screen.getByText('completed')).toBeInTheDocument()
  expect(screen.getByText(/2\/2 items/)).toBeInTheDocument()
  expect(screen.getByText(/\$0\.42/)).toBeInTheDocument()
})

test('empty state shown when no batches exist', async () => {
  server.use(http.get('/api/batches', () => HttpResponse.json([])))
  renderPage()
  expect(await screen.findByText('No batches yet.')).toBeInTheDocument()
})

test('load failure shows alert', async () => {
  server.use(http.get('/api/batches', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to load batches.*boom/)
})
