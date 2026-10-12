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
import LibraryFactionsPage from './LibraryFactionsPage'
vi.mock('./render', () => ({ renderCard: vi.fn(), pngBlob: vi.fn(), loadFonts: vi.fn().mockResolvedValue(undefined), paintRun: vi.fn() }))
const combat: Card = { id: 1, faction_id: 1, category: 'combat', name: 'Winged Horror', level: 0, resource_cost: 2, guns: 2, shields: 0, eagles: 0, upper_text: 'Gain 3 [GUN].', lower_text: 'Gain 2 [SKULL].', created_at: '', updated_at: '' }
const upgrade: Card = { id: 3, faction_id: 1, category: 'upgrade', name: 'Forge World', upgrade_type: 'deploy', text: 'Deploy one more unit.', created_at: '', updated_at: '' }
let records: Card[], deleted: number[][], updates: unknown[], templates: AssemblyTemplate[], assemblies: Record<string, Assembly>, assemblyUpdates: unknown[]
beforeEach(() => {
  useAssembly.setState({ factionId: null, category: 'combat', edits: {}, transforms: {} })
  records = [{ ...combat }, { ...combat, id: 2, name: 'Second card' }, upgrade]; updates = []; deleted = []
  templates = [{ faction_id: 1, category: 'combat', side: 'front', image_key: 'test-5' }]; assemblies = {}; assemblyUpdates = []
  vi.mocked(renderCard).mockReset().mockImplementation(async input => ({ canvas: document.createElement('canvas'), warnings: [], textPositions: { upper_text: input.layout.upper_text, lower_text: input.layout.lower_text } }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  server.use(
    http.get('/api/card-type-layouts', () => HttpResponse.json([{ category: 'combat', layout: { upper_text: { x: 15 } } }])),
    http.get('/api/faction-logos', () => HttpResponse.json([{ faction_id: 1, url: '/api/factions/1/logo?v=a' }])),
    http.get('/api/subtypes', () => HttpResponse.json([{ id: 1, category: 'combat', name: 'Level 0', overlays: [{ id: 7, url: '/l0' }] }, { id: 2, category: 'combat', name: 'Level 1+', layout: { resources: { x: 33 } }, overlays: [{ id: 8, url: '/l1' }] }, { id: 4, category: 'combat', name: 'Elite', overlays: [{ id: 9, url: '/api/subtypes/4/overlays/9' }] }])),
    http.get('/api/assembly-templates', () => HttpResponse.json(templates)),
    http.put('/api/assembly-templates', async ({ request }) => { const t = await request.json() as AssemblyTemplate; templates = [...templates.filter(x => x.faction_id !== t.faction_id || x.category !== t.category || (x.side ?? 'front') !== (t.side ?? 'front')), t]; return HttpResponse.json(t) }),
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
    { path: '/assemble/cards/new', element: <NewCardPage /> },
    { path: '/assemble/cards/:id', element: <CardEditorPage /> },
    { path: '/faction-lab', element: <p>Lab</p> },
  ], { initialEntries: [path] })
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

test('library renders every combat card of the faction on the chosen template', async () => {
  mount('/assemble')
  await screen.findByRole('link', { name: 'Edit Second card' })
  await waitFor(() => expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Winged Horror' }), imageUrl: '/api/generations/5/image', overlayUrl: null, overlayUrls: ['/l0'] })))
  expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Second card' }) }))
  expect(screen.getByRole('link', { name: 'Edit in Faction Lab' })).toHaveAttribute('href', '/faction-lab?faction=1&card_type=3&generation=5')
  await userEvent.click(screen.getByRole('tab', { name: /Upgrades/ }))
  expect(await screen.findByText('Deploy one more unit.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Edit Winged Horror' })).not.toBeInTheDocument()
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
  fireEvent.change(screen.getByLabelText('Guns'), { target: { value: '-1' } })
  expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Guns'), { target: { value: '3' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved.')
  expect(updates).toEqual([expect.objectContaining({ upper_text: 'New [MORALE]', guns: 3 })])
  expect(assemblyUpdates).toEqual([expect.objectContaining({ image_key: 'upload', transform: { scale: 1, x: 12, y: 0 } })])
  expect(useAssembly.getState()).toMatchObject({ edits: {}, transforms: {} })
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

test('combat cards use the level subtype until another subtype is chosen', async () => {
  mount('/assemble/cards/1')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ overlayUrls: ['/l0'], logoUrl: '/api/factions/1/logo?v=a' })))
  expect(await screen.findByRole('option', { name: 'Automatic by level (Level 0)' })).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Level'), '2')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ overlayUrls: ['/l1'], layout: expect.objectContaining({ resources: expect.objectContaining({ x: 33, y: 27 }) }) })))
  expect(screen.queryByRole('option', { name: 'Resource icons (guns, shields, morale)' })).not.toBeInTheDocument()
  await userEvent.selectOptions(await screen.findByLabelText('Subtype'), '4')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ overlayUrls: ['/api/subtypes/4/overlays/9'] })))
  expect(assemblyUpdates).toEqual([expect.objectContaining({ subtype_id: 4 })])
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

test('new event cards use the event fields and return to the Events tab', async () => {
  const router = mount('/assemble/cards/new?faction=1&tab=events')
  await userEvent.type(await screen.findByLabelText('Title'), 'Ambush')
  expect(screen.getByText('Previews are available for combat cards only.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Move one unit.' } })
  await userEvent.click(screen.getByRole('button', { name: 'Create card' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/assemble'))
  expect(records.at(-1)).toMatchObject({ name: 'Ambush', category: 'schema', subtype: 'schema', text: 'Move one unit.' })
  expect(await screen.findByRole('tab', { name: /Events/ })).toHaveAttribute('aria-selected', 'true')
})

test('combat cards are grouped into a section per level', async () => {
  records = [{ ...combat }, { ...combat, id: 2, name: 'Second card', level: 2 }, { ...combat, id: 4, name: 'Third card', level: 2 }, upgrade]
  mount('/assemble')
  const level0 = await screen.findByRole('region', { name: 'Level 0' })
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
  await userEvent.click(screen.getByRole('button', { name: 'Create card' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/assemble/cards/9'))
  expect(assemblies['9']).toMatchObject({ image_key: 'upload' })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ artworkUrl: '/api/cards/9/artwork?v=new' })))
})

test('cards use the card type text layout', async () => {
  mount('/assemble/cards/1')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ upper_text: expect.objectContaining({ x: 15 }) }) })))
})

test('the deck back is listed first and chosen from the settings on the Back side', async () => {
  mount('/assemble')
  const backSection = await screen.findByRole('region', { name: 'Card back' })
  await userEvent.click(within(backSection).getByRole('button', { name: 'Choose Combat back' }))
  const dialog = await screen.findByRole('dialog', { name: 'Card templates' })
  expect(within(dialog).getByRole('tab', { name: 'back' })).toHaveAttribute('aria-selected', 'true')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Use Generated art as back' }))
  await waitFor(() => expect(templates).toContainEqual({ faction_id: 1, category: 'combat', side: 'back', image_key: 'test-5' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(await within(backSection).findByRole('img', { name: 'Combat back' })).toHaveAttribute('src', '/api/generations/5/image')
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
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Righteous Fury', level: 0 }), overlayUrls: ['/l0'] })))
  await userEvent.selectOptions(within(dialog).getByLabelText('Preview with card'), '2')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Second card' }) })))
  expect(within(dialog).getByLabelText('Demo level')).toBeDisabled()
  await userEvent.click(within(dialog).getByLabelText('Favourites only'))
  expect(within(dialog).getByRole('button', { name: 'Use Generated art' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Use Plain art' })).not.toBeInTheDocument()
})


test('library exposes the card content editor and JSON import', async () => {
  mount('/assemble')
  const content = await screen.findByRole('link', { name: 'Cards / JSON import' })
  expect(content).toHaveAttribute('href', '/cards')
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
  fireEvent.change(within(dialog).getByLabelText('JSON content'), { target: { value: JSON.stringify(good) } })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
  expect(await screen.findByText('Imported 1 card.')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Edit Imported' })).toBeInTheDocument()
})
