import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import { GenerationWatcher, Notices } from './Notices'
import { useNotices } from '../lib/notifications'
import type { Generation } from '../pages/test-generation/api'

const base: Generation = {
  id: 7, faction_id: 2, card_type_id: 3, mode: 'draft', model: '', quality: 'low', name: '7-Tau-combat-low', favorite: false, parent_kind: '', parent_id: 0, parent_name: '',
  edit_instruction: '', prompt: 'p', status: 'pending', image_path: '', input_tokens: 0, output_tokens: 0, cost_usd: 0, duration_ms: 0, error: '', created_at: '2026-01-01 00:00:00',
}
let list: Generation[] = []
function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname}{l.search}</span> }

function renderApp(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={qc}><MemoryRouter><GenerationWatcher /><Notices /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter></QueryClientProvider>)
  return qc
}

beforeEach(() => {
  useNotices.setState({ notices: [] })
  server.use(http.get('/api/generations', () => HttpResponse.json(list)))
})

test('announces a generation that finishes, with its name, time and price; a click opens it in the lab', async () => {
  list = [{ ...base }]
  const qc = renderApp()
  await waitFor(() => expect(qc.getQueryData(['generations'])).toBeDefined())
  expect(screen.queryByRole('status')).not.toBeInTheDocument() // still running
  list = [{ ...base, status: 'done', duration_ms: 74000, cost_usd: 0.1536 }]
  await act(async () => { await qc.refetchQueries({ queryKey: ['generations'] }) })
  const notice = await screen.findByRole('status')
  expect(notice).toHaveTextContent('7-Tau-combat-low')
  expect(notice).toHaveTextContent('1m 14s')
  expect(notice).toHaveTextContent('$0.15')
  await userEvent.click(screen.getByTitle('Open in AI Lab'))
  expect(screen.getByTestId('where')).toHaveTextContent('/faction-lab?faction=2&card_type=3&generation=7')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('what was already finished when the app opened is not announced; notices stack and the cross closes one', async () => {
  list = [{ ...base, id: 1, status: 'done' }, { ...base, id: 2 }, { ...base, id: 3, name: 'third' }]
  const qc = renderApp()
  await waitFor(() => expect(qc.getQueryData(['generations'])).toBeDefined())
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  list = [{ ...base, id: 1, status: 'done' }, { ...base, id: 2, status: 'done', name: 'second' }, { ...base, id: 3, status: 'failed', name: 'third', error: 'openai: bad size' }]
  await act(async () => { await qc.refetchQueries({ queryKey: ['generations'] }) })
  expect(await screen.findAllByRole('status')).toHaveLength(2)
  expect(screen.getByText('openai: bad size')).toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0])
  expect(screen.getAllByRole('status')).toHaveLength(1)
})

test('a notice closes by itself after five seconds', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    useNotices.getState().notify({ generationId: 9, factionId: 1, cardTypeId: 1, name: 'x', durationMs: 1000, costUsd: 0.01, failed: false, error: '' })
    renderApp()
    expect(await screen.findByRole('status')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(4900) })
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  } finally { vi.useRealTimers() }
})
