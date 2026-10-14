import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import type { Card, CardInput } from '../cards/model'
import { pngBlob, renderCard } from './render'
import { useAssembly } from './state'
import { emptyAssembly, type Assembly, type AssemblyTemplate } from './api'
import AssemblePage from './AssemblePage'
import CardEditorPage from './CardEditorPage'
import NewCardPage from './NewCardPage'
import BackPage from './BackPage'
import LibraryFactionsPage from './LibraryFactionsPage'
vi.mock('./render', () => ({ renderCard: vi.fn(), pngBlob: vi.fn(), loadFonts: vi.fn().mockResolvedValue(undefined), paintRun: vi.fn() }))
const combat: Card = { id: 1, faction_id: 1, category: 'combat', name: 'Winged Horror', starting: true, level: 0, resource_cost: 0, guns: 2, shields: 0, eagles: 0, upper_text: 'Gain 3 [GUN].', lower_text: 'Gain 2 [SKULL].', created_at: '', updated_at: '' }
const upgrade: Card = { id: 3, faction_id: 1, category: 'upgrade', name: 'Forge World', upgrade_type: 'deploy', level: 1, resource_cost: 2, text: 'Deploy one more unit.', created_at: '', updated_at: '' }
let records: Card[], deleted: number[][], updates: unknown[], templates: AssemblyTemplate[], assemblies: Record<string, Assembly>, assemblyUpdates: unknown[]
beforeEach(() => {
  useAssembly.setState({ factionId: null, category: 'combat', edits: {}, transforms: {}, logoScales: {} })
  records = [{ ...combat }, { ...combat, id: 2, name: 'Second card' }, upgrade]; updates = []; deleted = []
  templates = [{ faction_id: 1, category: 'combat', side: 'front', image_key: 'test-5' }]; assemblies = {}; assemblyUpdates = []
  vi.mocked(renderCard).mockReset().mockImplementation(async input => ({ canvas: document.createElement('canvas'), warnings: [], textPositions: { upper_text: input.layout.upper_text, lower_text: input.layout.lower_text } }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  server.use(
    http.get('/api/card-type-layouts', () => HttpResponse.json([{ category: 'combat', layout: { upper_text: { x: 15 } } }])),
    http.get('/api/faction-logos', () => HttpResponse.json([{ faction_id: 1, url: '/api/factions/1/logo?v=a' }])),
    http.get('/api/nebulas', () => HttpResponse.json([])),
    http.get('/api/nebula-placements', () => HttpResponse.json([])),
    http.get('/api/assembly-templates', () => HttpResponse.json(templates)),
    http.put('/api/assembly-templates', async ({ request }) => { const input = await request.json() as AssemblyTemplate; const t = { ...templates.find(x => x.faction_id === input.faction_id && x.category === input.category && (x.side ?? 'front') === (input.side ?? 'front')), ...input }; templates = [...templates.filter(x => x.faction_id !== t.faction_id || x.category !== t.category || (x.side ?? 'front') !== (t.side ?? 'front')), t]; return HttpResponse.json(t) }),
    http.get('/api/cards/:id/assembly', ({ params }) => HttpResponse.json(assemblies[String(params.id)] ?? emptyAssembly())),
    http.put('/api/cards/:id/assembly', async ({ params, request }) => { const a = await request.json() as Assembly; assemblyUpdates.push(a); assemblies[String(params.id)] = { ...a, image_url: a.image_key ? `/api/cards/${params.id}/artwork?v=saved` : '' }; return HttpResponse.json(assemblies[String(params.id)]) }),
    http.post('/api/cards/:id/artwork', ({ params }) => { assemblies[String(params.id)] = { ...emptyAssembly(), image_key: 'upload', image_url: `/api/cards/${params.id}/artwork?v=new` }; return HttpResponse.json(assemblies[String(params.id)]) }),
    http.get('/api/cards', () => HttpResponse.json(records)),
    http.post('/api/cards/delete', async ({ request }) => { const { ids } = await request.json() as { ids: number[] }; deleted.push(ids); records = records.filter(c => !ids.includes(c.id)); return HttpResponse.json({ deleted: ids.length }) }),
    http.post('/api/cards/import', async ({ request }) => { const { cards } = await request.json() as { cards: CardInput[] }; const made = cards.map((c, i) => ({ ...c, id: 100 + i, created_at: '', updated_at: '' }) as Card); records = [...records, ...made]; return HttpResponse.json({ cards: made, count: made.length }, { status: 201 }) }),
    http.post('/api/cards', async ({ request }) => { const input = await request.json() as CardInput; const card = { ...input, id: 9, created_at: '', updated_at: '' } as Card; records = [...records, card]; return HttpResponse.json(card, { status: 201 }) }),
    http.get('/api/cards/:id', ({ params }) => HttpResponse.json(records.find(c => c.id === Number(params.id)))),
    http.get('/api/factions', () => HttpResponse.json([{ id: 1, name: 'Tau' }])),
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: 'frame.png' }])),
    http.get('/api/generations', () => HttpResponse.json([{ id: 5, name: 'Generated art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'art.png', created_at: '2026' }])),
    http.get('/api/batch-items', () => HttpResponse.json([{ id: 6, batch_id: 2, name: 'Batch art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'batch.png', completed_at: '2025' }])),
    http.put('/api/cards/:id', async ({ request, params }) => { const input = await request.json() as CardInput; updates.push(input); const saved = { ...input, id: Number(params.id), created_at: '', updated_at: '' } as Card; records = records.map(c => c.id === saved.id ? saved : c); return HttpResponse.json(saved) }),
  )
})
function mount(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/assemble', element: <AssemblePage /> },
    { path: '/assemble/back/:tab', element: <BackPage /> },
    { path: '/assemble/cards/new', element: <NewCardPage /> },
    { path: '/assemble/cards/:id', element: <CardEditorPage /> },
    { path: '/faction-lab', element: <p>Lab</p> },
  ], { initialEntries: [path] })
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

test('library renders every combat card of the faction on the chosen template', async () => {
  templates = [...templates, { faction_id: 1, category: 'upgrade', side: 'front', image_key: 'test-5' }]
  mount('/assemble')
  await screen.findByRole('link', { name: 'Edit Second card' })
  await waitFor(() => expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Winged Horror' }), imageUrl: '/api/generations/5/image' })))
  expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Second card' }) }))
  expect(screen.getByRole('link', { name: 'Edit in Faction Lab' })).toHaveAttribute('href', '/faction-lab?faction=1&card_type=3&generation=5')
  await userEvent.click(screen.getByRole('tab', { name: /Upgrades/ }))
  expect(await screen.findByRole('link', { name: 'Edit Forge World' })).toBeInTheDocument()
  await waitFor(() => expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ category: 'upgrade', name: 'Forge World', upgrade_type: 'deploy', level: 1, resource_cost: 2 }) })))
  expect(screen.queryByRole('link', { name: 'Edit Winged Horror' })).not.toBeInTheDocument()
})

test.each(['Lab', 'Batch'])('library deletes an unwanted %s experiment only after confirmation', async source => {
  templates = []
  const name = source === 'Lab' ? 'Generated art' : 'Batch art'
  const path = source === 'Lab' ? '/api/generations/5' : '/api/batches/2/items/6'
  let removed = false
  server.use(
    http.delete(path, () => { removed = true; return new HttpResponse(null, { status: 204 }) }),
    http.get('/api/generations', () => HttpResponse.json(removed && source === 'Lab' ? [] : [{ id: 5, name: 'Generated art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'art.png', created_at: '2026' }])),
    http.get('/api/batch-items', () => HttpResponse.json(removed && source === 'Batch' ? [] : [{ id: 6, batch_id: 2, name: 'Batch art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'batch.png', completed_at: '2025' }])),
  )
  mount('/assemble')
  await userEvent.click(await screen.findByRole('button', { name: 'Card template settings' }))
  const picker = await screen.findByRole('dialog', { name: 'Card templates' })
  await userEvent.click(await within(picker).findByRole('button', { name: `Delete ${name}` }))
  let confirmation = await screen.findByRole('dialog', { name: 'Delete generated image?' })
  expect(removed).toBe(false)
  await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
  expect(removed).toBe(false)
  await userEvent.click(within(picker).getByRole('button', { name: `Delete ${name}` }))
  confirmation = await screen.findByRole('dialog', { name: 'Delete generated image?' })
  await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete image' }))
  await waitFor(() => expect(within(picker).queryByRole('button', { name: `Use ${name}` })).not.toBeInTheDocument())
  expect(within(picker).getByRole('button', { name: `Use ${source === 'Lab' ? 'Batch art' : 'Generated art'}` })).toBeInTheDocument()
})

test('library explains why a used template cannot be deleted', async () => {
  server.use(http.delete('/api/generations/5', () => HttpResponse.json({ error: 'Choose another image or clear the choice first' }, { status: 409 })))
  mount('/assemble')
  await userEvent.click(await screen.findByRole('button', { name: 'Card template settings' }))
  const picker = await screen.findByRole('dialog', { name: 'Card templates' })
  await userEvent.click(await within(picker).findByRole('button', { name: 'Delete Generated art' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Delete generated image?' })
  await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete image' }))
  expect(await within(confirmation).findByRole('alert')).toHaveTextContent('clear the choice first')
  expect(within(picker).getByRole('button', { name: 'Use Generated art' })).toBeInTheDocument()
})

test('settings dialog lists faction images as demo cards and saves the choice', async () => {
  templates = []
  mount('/assemble')
  expect(await screen.findByText(/No combat template chosen for Tau/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Card template settings' }))
  const dialog = await screen.findByRole('dialog', { name: 'Card templates' })
  await waitFor(() => expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Righteous Fury' }), imageUrl: '/api/batches/2/items/6/image' })))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Use Batch art' }))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Use Batch art' })).toHaveAttribute('aria-pressed', 'true'))
  expect(templates).toEqual([{ faction_id: 1, category: 'combat', side: 'front', image_key: 'batch-6' }])
})

test('editor previews text edits and saves card and artwork position together; text cannot be repositioned', async () => {
  assemblies['1'] = { ...emptyAssembly(), image_key: 'upload', image_url: '/api/cards/1/artwork?v=a' }
  mount('/assemble/cards/1')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artworkUrl: '/api/cards/1/artwork?v=a', imageUrl: '/api/generations/5/image' })))
  fireEvent.change(screen.getByLabelText('Upper text'), { target: { value: 'New [MORALE]' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ upper_text: 'New [MORALE]' }) })))
  fireEvent.change(screen.getByLabelText('Offset X (%)'), { target: { value: '12' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: { scale: 1, x: 12, y: 0 } })))
  expect(screen.queryByLabelText('Start X (%)')).not.toBeInTheDocument()
  // The stepper never goes below zero, so a number field cannot hold an invalid value.
  fireEvent.change(screen.getByLabelText('Guns'), { target: { value: '-1' } })
  expect(screen.getByLabelText('Guns')).toHaveValue(0)
  fireEvent.change(screen.getByLabelText('Guns'), { target: { value: '3' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved.')
  expect(updates).toEqual([expect.objectContaining({ upper_text: 'New [MORALE]', guns: 3 })])
  expect(assemblyUpdates).toEqual([expect.objectContaining({ image_key: 'upload', transform: { scale: 1, x: 12, y: 0 } })])
  expect(useAssembly.getState()).toMatchObject({ edits: {}, transforms: {}, logoScales: {} })
  expect(screen.getByRole('link', { name: 'Edit template in Faction Lab' })).toHaveAttribute('href', '/faction-lab?faction=1&card_type=3&generation=5')
})

test('editor uploads and removes artwork', async () => {
  mount('/assemble/cards/1')
  const file = new File(['png'], 'art.png', { type: 'image/png' })
  await userEvent.upload(await screen.findByLabelText('Artwork file (PNG / JPEG)'), file)
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artworkUrl: '/api/cards/1/artwork?v=new' })))
  await userEvent.click(screen.getByRole('button', { name: 'Remove artwork' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artworkUrl: null })))
  expect(assemblyUpdates).toEqual([expect.objectContaining({ image_key: '' })])
})

test('library factions page counts cards per type and links to the library tab', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/factions', element: <LibraryFactionsPage /> },
    { path: '/assemble', element: <AssemblePage /> },
  ], { initialEntries: ['/factions?mode=library'] })
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
  expect(await screen.findByRole('link', { name: 'Tau Combat: 2 of 14' })).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: 'Tau logo' })).toHaveAttribute('src', '/api/factions/1/logo?v=a')
  expect(screen.getByRole('link', { name: 'Tau Events: 0 of 8' })).toHaveAttribute('href', '/assemble?faction=1&tab=events')
  await userEvent.click(screen.getByRole('link', { name: 'Tau Upgrades: 1 of 5' }))
  expect(await screen.findByRole('tab', { name: /Upgrades/ })).toHaveAttribute('aria-selected', 'true')
  expect(useAssembly.getState()).toMatchObject({ factionId: 1, category: 'upgrade' })
  await waitFor(() => expect(router.state.location.search).toBe(''))
})

test('the editor has no subtype choice: starting cards take the faction logo and regular ones the level and price', async () => {
  mount('/assemble/cards/1')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ starting: true }), logoUrl: '/api/factions/1/logo?v=a' })))
  expect(screen.queryByLabelText('Subtype')).not.toBeInTheDocument()
  await userEvent.click(await screen.findByLabelText('Starting card'))
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: '2' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ starting: false, level: 2 }) })))
  expect(assemblyUpdates).toEqual([])
})

test('Cmd+Z in the card editor undoes artwork position changes', async () => {
  assemblies['1'] = { ...emptyAssembly(), image_key: 'upload', image_url: '/api/cards/1/artwork?v=a' }
  mount('/assemble/cards/1')
  const offset = await screen.findByLabelText<HTMLInputElement>('Offset X (%)')
  fireEvent.change(offset, { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Offset Y (%)'), { target: { value: '5' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: { scale: 1, x: 12, y: 5 } })))
  fireEvent.keyDown(offset, { key: 'z', metaKey: true })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: { scale: 1, x: 12, y: 0 } })))
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: { scale: 1, x: 0, y: 0 } })))
  await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: { scale: 1, x: 12, y: 0 } })))
  fireEvent.keyDown(screen.getByLabelText('Upper text'), { key: 'z', metaKey: true })
  expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: { scale: 1, x: 12, y: 0 } }))
})
test('artwork moves only while selected; Enter keeps the move, Esc puts it back', async () => {
  assemblies['1'] = { ...emptyAssembly(), image_key: 'upload', image_url: '/api/cards/1/artwork?v=a' }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  mount('/assemble/cards/1')
  const canvas = await screen.findByLabelText('Assembled card')
  await waitFor(() => expect(canvas).not.toHaveClass('hidden'))
  const drag = () => { fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 200, pointerId: 1 }); fireEvent.pointerMove(canvas, { clientX: 120, clientY: 200, pointerId: 1 }); fireEvent.pointerUp(canvas, { pointerId: 1 }) }
  drag() // the first press only selects
  await new Promise(r => setTimeout(r, 20))
  expect(useAssembly.getState().transforms['1']).toBeUndefined()
  expect(screen.getByRole('button', { name: 'Apply (Enter)' })).toBeInTheDocument()
  drag()
  await waitFor(() => expect(useAssembly.getState().transforms['1']).toEqual({ scale: 1, x: 10, y: 0 }))
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(useAssembly.getState().transforms['1']).toBeUndefined())
  expect(screen.getByRole('button', { name: 'Select artwork to move' })).toBeInTheDocument()
  drag(); drag(); drag() // select, then two moves in one session
  await waitFor(() => expect(useAssembly.getState().transforms['1']).toEqual({ scale: 1, x: 20, y: 0 }))
  fireEvent.keyDown(window, { key: 'Enter' })
  expect(await screen.findByRole('button', { name: 'Select artwork to move' })).toBeInTheDocument()
  expect(useAssembly.getState().transforms['1']).toEqual({ scale: 1, x: 20, y: 0 })
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(useAssembly.getState().transforms['1']).toBeUndefined())
})
test('a new card starts from an empty form for the faction and tab, previews, and opens in the editor', async () => {
  const router = mount('/assemble')
  await userEvent.click(await screen.findByRole('link', { name: 'New combat card' }))
  expect(router.state.location.search).toBe('?faction=1&tab=combat')
  const title = await screen.findByLabelText('Title')
  expect(title).toHaveValue('')
  expect(screen.getByLabelText('Faction')).toHaveValue('1')
  expect(screen.getByRole('button', { name: 'Create card' })).toBeDisabled()
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'New card', level: 0 }) })))
  await userEvent.type(title, 'Iron Will')
  fireEvent.change(screen.getByLabelText('Upper text'), { target: { value: 'Gain (B).' } })
  await userEvent.click(screen.getByRole('button', { name: 'Create card' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/assemble/cards/9'))
  expect(records.at(-1)).toMatchObject({ name: 'Iron Will', faction_id: 1, category: 'combat', upper_text: 'Gain (B).' })
})

test('new event cards are created in the assembly editor with the event fields', async () => {
  templates = [...templates, { faction_id: 1, category: 'schema', side: 'front', image_key: 'test-5' }]
  const router = mount('/assemble/cards/new?faction=1&tab=events')
  await userEvent.type(await screen.findByLabelText('Title'), 'Ambush')
  await userEvent.selectOptions(screen.getByLabelText('Action'), 'rotate_clockwise')
  fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Move one unit.' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ category: 'schema', action: 'rotate_clockwise' }) })))
  await userEvent.click(screen.getByRole('button', { name: 'Create card' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/assemble/cards/9'))
  expect(records.at(-1)).toMatchObject({ name: 'Ambush', category: 'schema', subtype: 'schema', action: 'rotate_clockwise', text: 'Move one unit.' })
})

test('combat cards are grouped into a section per level', async () => {
  records = [{ ...combat }, { ...combat, id: 2, name: 'Second card', starting: false, level: 2 }, { ...combat, id: 4, name: 'Third card', starting: false, level: 2 }, upgrade]
  mount('/assemble')
  const level0 = await screen.findByRole('region', { name: 'Starting cards' })
  const level2 = screen.getByRole('region', { name: 'Level 2' })
  expect(within(level0).getByRole('link', { name: 'Edit Winged Horror' })).toBeInTheDocument()
  expect(within(level2).getAllByRole('link').map(l => l.getAttribute('aria-label'))).toEqual(['Edit Second card', 'Edit Third card'])
  expect(within(level2).getByText('2 cards')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Level 1' })).not.toBeInTheDocument()
})

test('artwork chosen on the new card form previews immediately and is uploaded after creation', async () => {
  const createObjectURL = vi.fn(() => 'blob:art'), revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  const router = mount('/assemble/cards/new?faction=1&tab=combat')
  await userEvent.type(await screen.findByLabelText('Title'), 'Iron Will')
  await userEvent.upload(screen.getByLabelText('Artwork file (PNG / JPEG)'), new File(['png'], 'art.png', { type: 'image/png' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artworkUrl: 'blob:art' })))
  expect(screen.getByRole('region', { name: 'Artwork' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Offset X (%)'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Offset Y (%)'), { target: { value: '-8' } })
  fireEvent.change(screen.getByLabelText(/Scale/), { target: { value: '1.5' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: { scale: 1.5, x: 18, y: -12 } })))
  expect(assemblyUpdates).toHaveLength(0) // Position stays local until creation.
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByLabelText('Offset X (%)')).toHaveValue('12')
  await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
  await userEvent.click(screen.getByRole('button', { name: 'Create card' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/assemble/cards/9'))
  expect(assemblies['9']).toMatchObject({ image_key: 'upload', transform: { scale: 1.5, x: 18, y: -12 } })
  await waitFor(() => expect(useAssembly.getState().transforms['-1']).toBeUndefined())
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artworkUrl: '/api/cards/9/artwork?v=saved' })))
})

test('cards use the card type text layout', async () => {
  mount('/assemble/cards/1')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ upper_text: expect.objectContaining({ x: 15 }) }) })))
})

test('the deck back is listed first and chosen on its own page', async () => {
  server.use(http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: 'frame.png' }, { id: 4, name: 'card back', overlay_path: '' }])), http.get('/api/generations', () => HttpResponse.json([{ id: 5, name: 'Generated art', status: 'done', card_type_id: 4, faction_id: 1, image_path: 'art.png', created_at: '2026' }])))
  mount('/assemble')
  const backSection = await screen.findByRole('region', { name: 'Card back' })
  await userEvent.click(within(backSection).getByRole('link', { name: 'Configure Combat back' }))
  expect(await screen.findByRole('heading', { name: 'Combat card back' })).toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Choose back image' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Use Generated art as back' }))
  await waitFor(() => expect(templates).toContainEqual({ faction_id: 1, category: 'combat', side: 'back', image_key: 'test-5' }))
  await userEvent.click(screen.getByRole('link', { name: /Combat cards/ }))
  expect(await within(await screen.findByRole('region', { name: 'Card back' })).findByRole('img', { name: 'Combat back' })).toHaveAttribute('src', '/api/generations/5/image')
})

test('the cube opens a 3D preview with the rendered front and the deck back, turned by dragging', async () => {
  templates.push({ faction_id: 1, category: 'combat', side: 'back', image_key: 'batch-6' })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,front')
  mount('/assemble')
  await userEvent.click(await screen.findByRole('button', { name: '3D preview of Winged Horror' }))
  const viewer = await screen.findByRole('dialog', { name: '3D preview of Winged Horror' })
  expect(within(viewer).getByRole('img', { name: 'Winged Horror front' })).toHaveAttribute('src', 'data:image/png;base64,front')
  expect(within(viewer).getByRole('img', { name: 'Winged Horror back' })).toHaveAttribute('src', '/api/batches/2/items/6/image')
  const card = within(viewer).getByTestId('card-3d'), before = card.style.transform
  const scene = card.parentElement!
  fireEvent.pointerDown(scene, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(scene, { clientX: 200, clientY: 100, pointerId: 1 })
  expect(card.style.transform).not.toBe(before)
  expect(card.style.transform).toContain('rotateY(18deg)')
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '3D preview of Winged Horror' })).not.toBeInTheDocument())
})

test('template settings preview with a chosen card or demo level, and can show favourites only', async () => {
  server.use(http.get('/api/generations', () => HttpResponse.json([
    { id: 5, name: 'Generated art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'art.png', created_at: '2026', favorite: true },
    { id: 7, name: 'Plain art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'p.png', created_at: '2025', favorite: false },
  ])))
  mount('/assemble')
  await userEvent.click(await screen.findByRole('button', { name: 'Card template settings' }))
  const dialog = await screen.findByRole('dialog', { name: 'Card templates' })
  await waitFor(() => expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Righteous Fury', level: 2 }), imageUrl: '/api/generations/7/image' })))
  await userEvent.selectOptions(within(dialog).getByLabelText('Demo level'), '0')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Righteous Fury', level: 0 }) })))
  await userEvent.selectOptions(within(dialog).getByLabelText('Preview with card'), '2')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Second card' }) })))
  expect(within(dialog).getByLabelText('Demo level')).toBeDisabled()
  await userEvent.click(within(dialog).getByLabelText('Favourites only'))
  expect(within(dialog).getByRole('button', { name: 'Use Generated art' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Use Plain art' })).not.toBeInTheDocument()
})


test('library offers JSON import without a link to the removed cards page', async () => {
  mount('/assemble')
  expect(await screen.findByRole('button', { name: 'Import JSON' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Cards / JSON import' })).not.toBeInTheDocument()
})

test('selected cards are deleted together after confirmation', async () => {
  mount('/assemble')
  await userEvent.click(await screen.findByLabelText('Select Winged Horror'))
  await userEvent.click(screen.getByLabelText('Select Second card'))
  expect(screen.getByText('2 selected')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  const confirm = await screen.findByRole('dialog', { name: 'Delete 2 cards?' })
  expect(within(confirm).getByText(/Winged Horror, Second card/)).toBeInTheDocument()
  await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
  expect(deleted).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete 2 cards?' })).getByRole('button', { name: 'Delete cards' }))
  await waitFor(() => expect(deleted).toEqual([[1, 2]]))
  expect(await screen.findByText('Deleted 2 cards.')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Edit Winged Horror' })).not.toBeInTheDocument())
})

test('selected rendered cards download as one zip of PNGs', async () => {
  vi.mocked(pngBlob).mockResolvedValue(new Blob([new Uint8Array([1, 2])], { type: 'image/png' }))
  const clicks: string[] = [], origClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () { clicks.push(this.download) }
  const origCreate = URL.createObjectURL
  URL.createObjectURL = () => 'blob:zip'
  try {
    mount('/assemble')
    await waitFor(() => expect(renderCard).toHaveBeenCalledTimes(2))
    await userEvent.click(await screen.findByRole('button', { name: 'Select all' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download PNGs (zip)' }))
    await waitFor(() => expect(clicks).toEqual(['Tau Combat.zip']))
    expect(pngBlob).toHaveBeenCalledTimes(2)
  } finally { HTMLAnchorElement.prototype.click = origClick; URL.createObjectURL = origCreate }
})

test('cards can be imported from JSON on the library page, with validation errors shown', async () => {
  mount('/assemble')
  await userEvent.click(await screen.findByRole('button', { name: 'Import JSON' }))
  const dialog = await screen.findByRole('dialog', { name: 'Import Cards' })
  fireEvent.change(within(dialog).getByLabelText('JSON content'), { target: { value: '{"cards":[{"faction_id":1,"name":"","category":"combat"}]}' } })
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Card 1, name: A non-empty name is required')
  expect(within(dialog).getByRole('button', { name: 'Import' })).toBeDisabled()
  const good = { cards: [{ faction_id: 1, name: 'Imported', category: 'combat', level: 1, resource_cost: 1, shields: 0, guns: 1, eagles: 0, upper_text: '', lower_text: '' }] }
  const upload = { source: 'deck.pdf', cards: good.cards.map(card => ({ ...card, faction_name: 'Tau', source_file_name: 'deck.pdf' })) }
  fireEvent.change(within(dialog).getByLabelText('JSON content'), { target: { value: JSON.stringify(upload) } })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
  expect(await screen.findByText('Imported 1 card.')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Edit Imported' })).toBeInTheDocument()
  expect(records.find(card => card.name === 'Imported')).toEqual({ ...good.cards[0], id: 100, created_at: '', updated_at: '' })
})

test('new-card artwork supports drag, cancel, wheel zoom, and removal before saving', async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:art'), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  mount('/assemble/cards/new?faction=1&tab=combat')
  await userEvent.upload(await screen.findByLabelText('Artwork file (PNG / JPEG)'), new File(['png'], 'art.png', { type: 'image/png' }))
  await screen.findByRole('button', { name: 'Select artwork to move' })
  const canvas = screen.getByLabelText('Assembled card')
  await userEvent.click(screen.getByRole('button', { name: 'Select artwork to move' }))
  fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 200, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 120, clientY: 200, pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  expect(useAssembly.getState().transforms['-1']).toEqual({ scale: 1, x: 10, y: 0 })
  await userEvent.click(screen.getByRole('button', { name: 'Cancel (Esc)' }))
  expect(useAssembly.getState().transforms['-1']).toBeUndefined()
  await userEvent.click(screen.getByRole('button', { name: 'Select artwork to move' }))
  fireEvent.wheel(canvas, { deltaY: -100, clientX: 100, clientY: 200 })
  expect(useAssembly.getState().transforms['-1']?.scale).toBeGreaterThan(1)
  await userEvent.click(screen.getByRole('button', { name: 'Apply (Enter)' }))
  await userEvent.click(screen.getByRole('button', { name: 'Remove artwork' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artworkUrl: null })))
  expect(screen.queryByLabelText('Offset X (%)')).not.toBeInTheDocument()
  expect(assemblyUpdates).toHaveLength(0)
})

test('failed artwork upload opens the created card instead of creating a duplicate', async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:art'), revokeObjectURL: vi.fn() }))
  server.use(http.post('/api/cards/:id/artwork', () => HttpResponse.json({ error: 'Upload failed' }, { status: 500 })))
  const router = mount('/assemble/cards/new?faction=1&tab=combat')
  await userEvent.type(await screen.findByLabelText('Title'), 'Iron Will')
  await userEvent.upload(screen.getByLabelText('Artwork file (PNG / JPEG)'), new File(['png'], 'art.png', { type: 'image/png' }))
  await screen.findByRole('button', { name: 'Select artwork to move' })
  fireEvent.change(screen.getByLabelText('Offset X (%)'), { target: { value: '12' } })
  await userEvent.click(screen.getByRole('button', { name: 'Create card' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/assemble/cards/9'))
  expect(records.filter(c => c.name === 'Iron Will')).toHaveLength(1)
  expect(await screen.findByText(/artwork or position could not be saved/)).toBeInTheDocument()
  expect(useAssembly.getState().transforms['9']).toMatchObject({ x: 12 })
})


test('the faction logo has no per-card size control and is drawn at the same size', async () => {
  mount('/assemble/cards/1')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ logoScale: 1 })))
  expect(screen.queryByLabelText(/Logo scale/)).not.toBeInTheDocument()
  expect(screen.getByText(/same for every card of the faction/)).toBeInTheDocument()
})

test('template image checkboxes select for deletion without changing the chosen template', async () => {
  mount('/assemble')
  await userEvent.click(await screen.findByRole('button', { name: 'Card template settings' }))
  const dialog = await screen.findByRole('dialog', { name: 'Card templates' })
  const image = await within(dialog).findByRole('checkbox', { name: 'Select Generated art' })
  const original = structuredClone(templates)
  await userEvent.click(image)
  await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Batch art' }))
  expect(templates).toEqual(original)
  expect(within(dialog).getByRole('button', { name: 'Delete Generated art' })).toHaveClass('absolute', 'top-2', 'right-2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete selected (2)' }))
  const confirmation = screen.getByRole('dialog', { name: 'Delete selected images?' })
  expect(confirmation).toHaveTextContent('Permanently delete 2 selected images')
  await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
  expect(image).toBeChecked()
})

test('right-click deletion targets one card and preserves other selected cards', async () => {
  mount('/assemble')
  await userEvent.click(await screen.findByLabelText('Select Second card'))
  const card = await screen.findByRole('link', { name: 'Edit Winged Horror' })
  fireEvent.contextMenu(card, { clientX: 100, clientY: 150 })
  await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Winged Horror' })).getByRole('menuitem', { name: 'Delete' }))
  const confirm = screen.getByRole('dialog', { name: 'Delete 1 card?' })
  expect(confirm).toHaveTextContent('Winged Horror')
  expect(confirm).not.toHaveTextContent('Second card')
  expect(deleted).toEqual([])
  await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
  expect(deleted).toEqual([])
  fireEvent.contextMenu(card)
  await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete 1 card?' })).getByRole('button', { name: 'Delete cards' }))
  await waitFor(() => expect(deleted).toEqual([[1]]))
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Edit Winged Horror' })).not.toBeInTheDocument())
  expect(screen.getByLabelText('Select Second card')).toBeChecked()
})

test('context menu closes on Escape or outside click without deleting', async () => {
  mount('/assemble')
  const card = await screen.findByRole('link', { name: 'Edit Winged Horror' })
  fireEvent.contextMenu(card)
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.contextMenu(card)
  await userEvent.click(screen.getByRole('heading', { name: 'Library' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(deleted).toEqual([])
})

test('upgrade cards also offer right-click deletion', async () => {
  mount('/assemble')
  await userEvent.click(await screen.findByRole('tab', { name: /Upgrades/ }))
  fireEvent.contextMenu(await screen.findByLabelText('Select Forge World'))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
  const confirm = screen.getByRole('dialog', { name: 'Delete 1 card?' })
  expect(confirm).toHaveTextContent('Forge World')
  await userEvent.click(within(confirm).getByRole('button', { name: 'Delete cards' }))
  await waitFor(() => expect(deleted).toEqual([[3]]))
})

test('the Faction config tab holds the faction logo, colour and banner (with its nebula)', async () => {
  let colour = ''
  server.use(http.get('/api/faction-colors', () => HttpResponse.json(colour ? [{ faction_id: 1, color: colour }] : [])),
    http.put('/api/faction-colors/1', async ({ request }) => { colour = ((await request.json()) as { color: string }).color; return HttpResponse.json({ faction_id: 1, color: colour }) }))
  mount('/assemble')
  await userEvent.click(await screen.findByRole('tab', { name: 'Faction config' }))
  expect(await screen.findByRole('region', { name: 'Faction logo' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Faction colour', { selector: 'input' }), { target: { value: '#aa3344' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save colour' }))
  await waitFor(() => expect(colour).toBe('#aa3344'))
  expect(screen.getByRole('region', { name: 'Banner' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Faction nebula' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Custom colour')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Card back' })).not.toBeInTheDocument()
})

test('the nebula position is set per card type on its back page and saved', async () => {
  let saved: unknown
  templates.push({ faction_id: 1, category: 'schema', side: 'back', image_key: 'test-5' })
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: 'frame.png' }, { id: 4, name: 'card back', overlay_path: '' }])),
    http.get('/api/generations', () => HttpResponse.json([{ id: 5, name: 'Generated art', status: 'done', card_type_id: 4, faction_id: 1, image_path: 'art.png', created_at: '2026' }])),
    http.put('/api/nebula-placements/1/schema', async ({ request }) => { saved = await request.json(); return HttpResponse.json({ faction_id: 1, category: 'schema', ...(saved as object) }) }))
  mount('/assemble/back/events?faction=1')
  const section = await screen.findByRole('region', { name: 'Back nebula' })
  expect(within(section).queryByLabelText('Seed')).not.toBeInTheDocument()
  fireEvent.change(within(section).getByLabelText(/Rotation/), { target: { value: '45' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved).toEqual({ x: 0, y: 0, rotation: 45, logo_scale: 0.5 }))
})

test('your own image can be uploaded from the back picker and is chosen at once', async () => {
  let uploaded: FormData | undefined
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: 'frame.png' }, { id: 4, name: 'card back', overlay_path: '' }])),
    http.post('/api/generations/upload', async ({ request }) => { uploaded = await request.formData().catch(() => undefined); return HttpResponse.json({ id: 9, faction_id: 1, card_type_id: 4, status: 'done' }, { status: 201 }) }))
  mount('/assemble/back/combat?faction=1')
  await userEvent.click(await screen.findByRole('button', { name: 'Choose back image' }))
  await userEvent.upload(await screen.findByLabelText('Upload your own image'), new File(['x'], 'mine.png', { type: 'image/png' }))
  await waitFor(() => expect(templates).toContainEqual({ faction_id: 1, category: 'combat', side: 'back', image_key: 'test-9' }))
  expect(uploaded === undefined || uploaded.get('card_type_id') === '4').toBe(true)
})

test('upgrade cards always use the bundled front picture, with no template to choose', async () => {
  mount('/assemble?faction=1&tab=upgrades')
  await waitFor(() => expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Forge World' }), imageUrl: expect.stringContaining('front') })))
  expect(screen.queryByText(/template chosen/)).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Card template settings' }))
  expect(await screen.findByRole('dialog', { name: 'Card templates' })).toBeInTheDocument()
  expect(await screen.findByText(/one front picture for every faction/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Upload your own image')).not.toBeInTheDocument()
})

test('a combat back edits nothing about its banner: no logo, banner size or nebula controls', async () => {
  templates.push({ faction_id: 1, category: 'combat', side: 'back', image_key: 'test-5' })
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: 'frame.png' }, { id: 4, name: 'card back', overlay_path: '' }])),
    http.get('/api/generations', () => HttpResponse.json([{ id: 5, name: 'Generated art', status: 'done', card_type_id: 4, faction_id: 1, image_path: 'art.png', created_at: '2026' }])))
  mount('/assemble/back/combat?faction=1')
  expect(await screen.findByRole('region', { name: 'Banner' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Upload card back logo')).not.toBeInTheDocument()
  for (const name of ['Logo size', 'Banner size', 'Back nebula', 'Nebula']) expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
})

test('an event back keeps its own logo size', async () => {
  let placementSaved: Record<string, unknown> | undefined
  templates.push({ faction_id: 1, category: 'combat', side: 'back', image_key: 'test-5' })
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: 'frame.png' }, { id: 4, name: 'card back', overlay_path: '' }])),
    http.get('/api/generations', () => HttpResponse.json([{ id: 5, name: 'Generated art', status: 'done', card_type_id: 4, faction_id: 1, image_path: 'art.png', created_at: '2026' }])),
    http.put('/api/nebula-placements/1/schema', async ({ request }) => { placementSaved = await request.json() as Record<string, unknown>; return HttpResponse.json({ faction_id: 1, category: 'schema', ...placementSaved }) }))
  mount('/assemble/back/events?faction=1')
  const section = await screen.findByRole('region', { name: 'Logo size' })
  fireEvent.change(within(section).getByRole('slider'), { target: { value: '70' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(placementSaved).toMatchObject({ logo_scale: 0.7 }))
})

test('the banner is assembled in the faction settings: logo size and element, saved together', async () => {
  let bannerSaved: Record<string, unknown> | undefined
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: 'frame.png' }, { id: 5, name: 'back element', overlay_path: '' }])),
    http.get('/api/generations', () => HttpResponse.json([{ id: 7, name: 'Gear crest', status: 'done', card_type_id: 5, faction_id: 1, image_path: 'el.png', created_at: '2026' }])),
    http.get('/api/faction-banners', () => HttpResponse.json(bannerSaved ? [{ faction_id: 1, ...bannerSaved }] : [])),
    http.put('/api/faction-banners/1', async ({ request }) => { bannerSaved = await request.json() as Record<string, unknown>; return HttpResponse.json({ faction_id: 1, ...bannerSaved }) }))
  mount('/assemble?faction=1&tab=config')
  const section = await screen.findByRole('region', { name: 'Banner' })
  fireEvent.change(within(section).getByLabelText(/Logo size/), { target: { value: '35' } })
  await userEvent.click(within(section).getByRole('button', { name: 'Choose element' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Use Gear crest as element' }))
  fireEvent.change(within(section).getByLabelText(/Element size/), { target: { value: '60' } })
  await userEvent.click(within(section).getByRole('button', { name: 'Save banner' }))
  await waitFor(() => expect(bannerSaved).toMatchObject({ logo_scale: 0.35, element_key: 'test-7', element_scale: 0.6 }))
  await userEvent.click(await within(section).findByRole('button', { name: 'Remove element' }))
  await userEvent.click(within(section).getByRole('button', { name: 'Save banner' }))
  await waitFor(() => expect(bannerSaved).toMatchObject({ element_key: '' }))
})

test('the banner\'s nebula position is saved with the banner', async () => {
  let placementSaved: Record<string, unknown> | undefined
  server.use(
    http.get('/api/nebula-placements', () => HttpResponse.json([])),
    http.put('/api/faction-banners/1', async ({ request }) => HttpResponse.json({ faction_id: 1, ...(await request.json() as object) })),
    http.put('/api/nebula-placements/1/combat', async ({ request }) => { placementSaved = await request.json() as Record<string, unknown>; return HttpResponse.json({ faction_id: 1, category: 'combat', ...placementSaved }) }))
  mount('/assemble?faction=1&tab=config')
  const section = await screen.findByRole('region', { name: 'Banner' })
  fireEvent.change(within(section).getByLabelText(/Nebula rotation/), { target: { value: '40' } })
  await userEvent.click(within(section).getByRole('button', { name: 'Save banner' }))
  await waitFor(() => expect(placementSaved).toMatchObject({ rotation: 40 }))
})

test('an event back can have its own nebula brightness, and fall back to the faction\'s', async () => {
  let saved: Record<string, unknown> | undefined
  server.use(
    http.get('/api/nebulas', () => HttpResponse.json([{ faction_id: 1, color: '', seed: 7, density: 1.2, as_template: false }])),
    http.put('/api/nebula-placements/1/schema', async ({ request }) => { saved = await request.json() as Record<string, unknown>; return HttpResponse.json({ faction_id: 1, category: 'schema', ...saved }) }))
  templates.push({ faction_id: 1, category: 'combat', side: 'back', image_key: 'test-5' })
  mount('/assemble/back/events?faction=1')
  const section = await screen.findByRole('region', { name: 'Back nebula' })
  expect(within(section).getByLabelText(/Nebula brightness \(120%\)/)).toBeInTheDocument()
  fireEvent.change(within(section).getByLabelText(/Nebula brightness/), { target: { value: '60' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved).toMatchObject({ brightness: 0.6 }))
})

test('the banner\'s nebula colour and brightness are set in the banner and saved with it', async () => {
  let nebulaSaved: Record<string, unknown> | undefined
  server.use(
    http.put('/api/faction-banners/1', async ({ request }) => HttpResponse.json({ faction_id: 1, ...(await request.json() as object) })),
    http.put('/api/nebulas/1', async ({ request }) => { nebulaSaved = await request.json() as Record<string, unknown>; return HttpResponse.json({ faction_id: 1, ...nebulaSaved }) }))
  mount('/assemble?faction=1&tab=config')
  const section = await screen.findByRole('region', { name: 'Banner' })
  fireEvent.change(within(section).getByLabelText(/Nebula brightness/), { target: { value: '150' } })
  await userEvent.click(within(section).getByRole('button', { name: 'Save banner' }))
  await waitFor(() => expect(nebulaSaved).toMatchObject({ density: 1.5 }))
})

test('the nebula can be switched on as the card template from the banner', async () => {
  let nebulaSaved: Record<string, unknown> | undefined
  server.use(http.put('/api/nebulas/1', async ({ request }) => { nebulaSaved = await request.json() as Record<string, unknown>; return HttpResponse.json({ faction_id: 1, ...nebulaSaved }) }))
  mount('/assemble?faction=1&tab=config')
  const section = await screen.findByRole('region', { name: 'Banner' })
  await userEvent.click(within(section).getByLabelText(/Use the nebula as the card template/))
  await waitFor(() => expect(nebulaSaved).toMatchObject({ as_template: true }))
})
