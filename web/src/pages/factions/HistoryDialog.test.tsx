import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useFactionsUi, useFactionDraft } from './store'
import type { Faction, FactionRevision } from './api'
import { HistoryDialog } from './HistoryDialog'

const faction: Faction = { id: 1, name: 'Eldar', description: 'v2 text', dlc: 'Darkest Dawn', created_at: 'a', updated_at: 'b' }
const revisions: FactionRevision[] = [
  { id: 12, faction_id: 1, name: 'Eldar', description: 'v2 text', dlc: 'Darkest Dawn', source: 'manual', created_at: '2026-07-15' },
  { id: 11, faction_id: 1, name: 'Eldar', description: 'v1 text', dlc: 'Darkest Dawn', source: 'claude', created_at: '2026-07-14' },
]

function renderDlg() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <HistoryDialog factions={[faction]} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useFactionDraft.getState().close()
  useFactionsUi.setState({ dialogMode: null, editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, historyFactionId: 1, expandedRevId: null, activeJobId: null })
  server.use(http.get('/api/factions/1/revisions', () => HttpResponse.json(revisions)))
})

test('lists revisions newest first with source badges', async () => {
  renderDlg()
  const dialog = await screen.findByRole('dialog', { name: /Eldar — History/ })
  expect(await within(dialog).findByText('claude')).toBeInTheDocument()
  expect(within(dialog).getByText('manual')).toBeInTheDocument()
  expect(within(dialog).getByText('current')).toBeInTheDocument()
})

test('expanding an old revision shows diff and restore posts', async () => {
  let restored = false
  server.use(
    http.post('/api/factions/1/revisions/11/restore', () => {
      restored = true
      return HttpResponse.json({ ...faction, description: 'v1 text' })
    }),
  )
  renderDlg()
  const dialog = await screen.findByRole('dialog', { name: /History/ })
  await userEvent.click(await within(dialog).findByText(/v1 text/))
  expect(within(dialog).getByText('Before')).toBeInTheDocument()
  const restoreBtn = within(dialog).getByRole('button', { name: 'Restore this version' })
  expect(restoreBtn).toBeEnabled()
  await userEvent.click(restoreBtn)
  expect(restored).toBe(true)
})

test('newest revision restore disabled', async () => {
  renderDlg()
  const dialog = await screen.findByRole('dialog', { name: /History/ })
  await userEvent.click(await within(dialog).findByText(/v2 text/))
  expect(within(dialog).getByRole('button', { name: 'Restore this version' })).toBeDisabled()
})

test('revisions query error still renders dialog shell with Close and an alert', async () => {
  server.use(http.get('/api/factions/1/revisions', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderDlg()
  const dialog = await screen.findByRole('dialog', { name: /Eldar — History/ })
  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('boom')
  const closeBtn = within(dialog).getByRole('button', { name: 'Close' })
  await userEvent.click(closeBtn)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useFactionsUi.getState().historyFactionId).toBeNull()
})
