import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useCardDraft } from './store'
import { exampleImport } from './import'
import type { Card, CardInput, Category } from './model'
import CardsPage from './CardsPage'

const factions = [1, 2].map(id => ({ id, name: id === 1 ? 'Tau' : 'Eldar', dlc: 'Galaxy in Flames', description: '', primary_color: '', texture: '', created_at: '', updated_at: '' }))
let records: Card[]
let posts: CardInput[]
let updates: CardInput[]
let imports: unknown[]
const savedCard = (input: CardInput, id = 1): Card => ({ ...input, id, created_at: 'now', updated_at: 'now' })
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ element: <><Link to="/factions">Go to Factions</Link><Outlet /></>, children: [
    { path: '/cards', element: <CardsPage /> }, { path: '/factions', element: <h1>Faction destination</h1> },
  ] }], { initialEntries: ['/cards'] })
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}
beforeEach(() => {
  useCardDraft.getState().close()
  records = [savedCard(exampleImport(1).cards[0])]; posts = []; updates = []; imports = []
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/cards', ({ request }) => {
      const p = new URL(request.url).searchParams
      return HttpResponse.json(records.filter(c => (!p.get('faction_id') || String(c.faction_id) === p.get('faction_id')) && (!p.get('category') || c.category === p.get('category'))))
    }),
    http.post('/api/cards', async ({ request }) => {
      const input = await request.json() as CardInput; posts.push(input)
      const card = savedCard(input, records.length + 1); records.push(card); return HttpResponse.json(card, { status: 201 })
    }),
    http.put('/api/cards/:id', async ({ request, params }) => {
      const input = await request.json() as CardInput; updates.push(input)
      const card = savedCard(input, Number(params.id)); records = records.map(c => c.id === card.id ? card : c); return HttpResponse.json(card)
    }),
    http.post('/api/cards/import', async ({ request }) => {
      const body = await request.json() as { cards: CardInput[] }; imports.push(body)
      const cards = body.cards.map((c, i) => savedCard(c, records.length + i + 1)); records.push(...cards)
      return HttpResponse.json({ count: cards.length, cards }, { status: 201 })
    }),
  )
})
async function newCard(category: Category = 'combat') {
  await userEvent.click(await screen.findByRole('button', { name: 'New Card' }))
  const d = screen.getByRole('dialog', { name: 'New Card' })
  await userEvent.type(within(d).getByLabelText('Name'), 'Новая карточка')
  await userEvent.selectOptions(within(d).getByLabelText('Category'), category)
  return d
}
test.each(['combat', 'schema', 'upgrade'] as const)('create %s only posts after Save, retains category fields and Unicode', async category => {
  renderPage(); const d = await newCard(category)
  if (category === 'combat') {
    expect(within(d).getByLabelText('Level').querySelectorAll('option')).toHaveLength(4)
    await userEvent.selectOptions(within(d).getByLabelText('Level'), '3')
    await userEvent.type(within(d).getByLabelText('Upper text'), 'Верх')
    await userEvent.type(within(d).getByLabelText('Lower text'), 'Низ')
    await userEvent.clear(within(d).getByLabelText('Guns')); await userEvent.type(within(d).getByLabelText('Guns'), '2')
  } else {
    await userEvent.type(within(d).getByLabelText('Text'), 'Эффект')
    const select = within(d).getByLabelText(category === 'schema' ? 'Action' : 'Upgrade type')
    expect(select.querySelectorAll('option')).toHaveLength(4)
    await userEvent.selectOptions(select, category === 'schema' ? 'move_horizontal' : 'upgrade')
  }
  expect(posts).toEqual([])
  await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
  await screen.findByText('Card saved.')
  expect(posts[0]).toMatchObject({ name: 'Новая карточка', faction_id: 1, category })
  expect(posts[0]).toMatchObject(category === 'combat' ? { level: 3, resource_cost: 0, guns: 2, upper_text: 'Верх', lower_text: 'Низ' } : category === 'schema' ? { subtype: 'schema', action: 'move_horizontal', text: 'Эффект' } : { upgrade_type: 'upgrade', text: 'Эффект' })
  await userEvent.click(screen.getByRole('button', { name: 'Edit Новая карточка' }))
  expect(screen.getByLabelText('Name')).toHaveValue('Новая карточка')
})
test('edit diff includes text and numeric fields; save uses PUT; category switch removes old fields', async () => {
  renderPage(); await userEvent.click(await screen.findByRole('button', { name: 'Edit Огневое превосходство' }))
  const d = screen.getByRole('dialog', { name: 'Edit Card' })
  await userEvent.type(within(d).getByLabelText('Upper text'), ' новый')
  await userEvent.clear(within(d).getByLabelText('Shields')); await userEvent.type(within(d).getByLabelText('Shields'), '4')
  await userEvent.click(within(d).getByRole('button', { name: 'Show diff' }))
  expect(within(d).getByText('Before')).toBeInTheDocument(); expect(within(d).getAllByText('Shields')).toHaveLength(2)
  await userEvent.selectOptions(within(d).getByLabelText('Category'), 'upgrade')
  expect(within(d).queryByLabelText('Upper text')).not.toBeInTheDocument()
  await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
  await screen.findByText('Card saved.'); expect(updates[0]).toEqual({ faction_id: 1, name: 'Огневое превосходство', category: 'upgrade', upgrade_type: 'deploy', text: '' })
})
test('both faction and category filters apply', async () => {
  records.push(savedCard({ ...exampleImport(2).cards[2], name: 'Eldar upgrade' }, 2)); renderPage()
  await screen.findByText('Eldar upgrade')
  await userEvent.selectOptions(screen.getByLabelText('Filter by faction'), '2')
  await waitFor(() => expect(screen.queryByText('Огневое превосходство')).not.toBeInTheDocument())
  await userEvent.selectOptions(screen.getByLabelText('Filter by category'), 'combat')
  await screen.findByText('No cards match these filters.')
  await userEvent.selectOptions(screen.getByLabelText('Filter by category'), 'upgrade')
  await screen.findByText('Eldar upgrade')
})
test('blank numeric input prevents Save; server failure preserves editable draft', async () => {
  renderPage(); const d = await newCard()
  await userEvent.clear(within(d).getByLabelText('Guns')); await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('guns'); expect(posts).toHaveLength(0)
  await userEvent.type(within(d).getByLabelText('Guns'), '0')
  server.use(http.post('/api/cards', () => HttpResponse.json({ error: 'Save unavailable' }, { status: 500 })))
  await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable'); expect(within(d).getByLabelText('Name')).toHaveValue('Новая карточка')
})
test('no factions disables creation and offers the Factions link', async () => {
  server.use(http.get('/api/factions', () => HttpResponse.json([]))); renderPage()
  expect(await screen.findByRole('link', { name: 'Open Factions' })).toHaveAttribute('href', '/factions?mode=library')
  expect(screen.getByRole('button', { name: 'New Card' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Import JSON' })).toBeDisabled()
})
test('dirty close cancellation preserves draft, discard closes, clean close needs no confirmation', async () => {
  renderPage(); const d = await newCard()
  await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(within(d).getByLabelText('Name')).toHaveValue('Новая карточка')
  await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }))
  const confirm = screen.getByRole('dialog', { name: 'Discard unsaved changes?' })
  await userEvent.click(within(confirm).getByRole('button', { name: 'Discard' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'New Card' })); await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('router navigation and beforeunload protect the dirty draft', async () => {
  renderPage(); const d = await newCard()
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
  await userEvent.click(screen.getByRole('link', { name: 'Go to Factions' }))
  expect(within(screen.getAllByTestId('dialog-backdrop').at(-1)!).getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(within(d).getByLabelText('Name')).toHaveValue('Новая карточка')
  await userEvent.click(screen.getByRole('link', { name: 'Go to Factions' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', { name: 'Discard' }))
  await screen.findByText('Faction destination')
  const clean = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false)
})
async function uploadCards(text: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Import JSON' }))
  await userEvent.upload(screen.getByLabelText('JSON file'), new File([text], 'cards.json', { type: 'application/json' }))
}
test('JSON upload previews, provides valid downloadable example, and only POSTs on Import', async () => {
  renderPage(); await uploadCards(JSON.stringify(exampleImport(1)))
  await screen.findByRole('region', { name: 'Import preview' }); expect(imports).toEqual([])
  await userEvent.click(screen.getByText('JSON format and validation rules'))
  const link = screen.getByRole('link', { name: 'Download example JSON' }); expect(link).toHaveAttribute('download', 'cards-example.json')
  const content = decodeURIComponent(link.getAttribute('href')!.split(',')[1]); expect(JSON.parse(content).cards).toHaveLength(3)
  expect(screen.getByText(/Tau \(ID 1\)/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Import' }))
  await screen.findByText('Imported 3 cards.'); expect(imports).toEqual([exampleImport(1)])
})
test('invalid JSON or field prevents POST, preserves source, and identifies card and field', async () => {
  renderPage(); await uploadCards(JSON.stringify({ cards: [{ ...exampleImport(1).cards[0], guns: -1 }] }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Card 1, guns'); expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled(); expect(imports).toEqual([])
  fireEvent.change(screen.getByLabelText('JSON content'), { target: { value: '{' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid JSON syntax'); expect(imports).toEqual([])
})
test('server indexed import errors retain preview and allow correction; import close asks confirmation', async () => {
  server.use(http.post('/api/cards/import', () => HttpResponse.json({ error: 'Card validation failed', errors: [{ index: 1, field: 'faction_id', message: 'Faction does not exist' }] }, { status: 400 })))
  renderPage(); const source = JSON.stringify(exampleImport(1)); await uploadCards(source)
  await screen.findByRole('region', { name: 'Import preview' }); await userEvent.click(screen.getByRole('button', { name: 'Import' }))
  expect(await screen.findByText('Card 2, faction_id: Faction does not exist')).toBeInTheDocument()
  expect(screen.getByLabelText('JSON content')).toHaveValue(source); expect(screen.getByRole('region', { name: 'Import preview' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' })); await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('JSON content')).toHaveValue(source)
  await userEvent.click(screen.getByRole('link', { name: 'Go to Factions' })); await userEvent.click(within(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', { name: 'Discard' }))
  await screen.findByText('Faction destination')
})
