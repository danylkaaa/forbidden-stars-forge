import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useFactionsUi, useFactionDraft } from './store'
import type { Faction } from './api'
import FactionsPage from './FactionsPage'

const factions: Faction[] = [
  { id: 1, name: 'Tau Empire', description: 'Blue-grey plating and honeycomb geometry over ritual.', dlc: 'Galaxy in Flames', created_at: '2026-07-10', updated_at: '2026-07-14' },
  { id: 2, name: 'Eldar', description: 'Bonewhite curves.', dlc: 'Darkest Dawn', created_at: '2026-07-09', updated_at: '2026-07-12' },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <FactionsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useFactionsUi.setState({ dialogMode: null, editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, historyFactionId: null, expandedRevId: null, activeJobId: null })
  useFactionDraft.getState().close()
  server.use(http.get('/api/factions', () => HttpResponse.json(factions)))
})

test('renders table rows with DLC tags', async () => {
  renderPage()
  expect(await screen.findByText('Tau Empire')).toBeInTheDocument()
  expect(screen.getByText('Galaxy in Flames')).toBeInTheDocument()
  expect(screen.getByText('Eldar')).toBeInTheDocument()
})

test('create flow posts and closes dialog', async () => {
  let posted: Record<string, unknown> | null = null
  server.use(
    http.post('/api/factions', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ id: 3, name: posted.name, description: posted.description, dlc: posted.dlc, created_at: 'now', updated_at: 'now' }, { status: 201 })
    }),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /New Faction/ }))
  const dialog = screen.getByRole('dialog', { name: 'New Faction' })
  await userEvent.type(within(dialog).getByLabelText('Name'), 'Necrons')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Darkest Dawn' }))
  await userEvent.type(within(dialog).getByLabelText('Description'), 'gunmetal')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save Faction' }))
  await screen.findByText('Tau Empire') // dialog closed, back to table
  expect(posted).toMatchObject({ name: 'Necrons', dlc: 'Darkest Dawn', description: 'gunmetal', source: 'manual' })
  expect(screen.queryByRole('dialog', { name: 'New Faction' })).not.toBeInTheDocument()
})

test('edit shows dirty badge and diff panel', async () => {
  renderPage()
  await screen.findByText('Tau Empire')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Faction' })
  const desc = within(dialog).getByLabelText('Description')
  await userEvent.clear(desc)
  await userEvent.type(desc, 'New aesthetic text')
  expect(within(dialog).getByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Show diff' }))
  expect(within(dialog).getByText('Before')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
  expect(within(dialog).queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('closing dirty dialog asks confirmation', async () => {
  renderPage()
  await screen.findByText('Tau Empire')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Faction' })
  await userEvent.type(within(dialog).getByLabelText('Name'), 'X')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByRole('dialog', { name: 'Edit Faction' })).toBeInTheDocument()
})

test('delete asks confirmation and calls DELETE', async () => {
  let deleted = false
  server.use(http.delete('/api/factions/2', () => { deleted = true; return new HttpResponse(null, { status: 204 }) }))
  renderPage()
  await screen.findByText('Eldar')
  await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
  expect(screen.getByText('Delete faction?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete faction' }))
  await screen.findByText('Tau Empire')
  expect(deleted).toBe(true)
})

test('delete failure shows alert, keeps dialog open, cancel still dismisses', async () => {
  server.use(http.delete('/api/factions/2', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderPage()
  await screen.findByText('Eldar')
  await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
  expect(screen.getByText('Delete faction?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete faction' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('boom')
  expect(screen.getByText('Delete faction?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByText('Delete faction?')).not.toBeInTheDocument()
})
