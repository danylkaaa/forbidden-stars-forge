import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useAssembly } from './state'
import { moveOverlay, type Subtype } from './subtypes'
import SubtypesPage from './SubtypesPage'
import { renderCard } from './render'
vi.mock('./render', () => ({ renderCard: vi.fn(), loadFonts: vi.fn().mockResolvedValue(undefined), paintRun: vi.fn() }))

let subtypes: Subtype[], orders: unknown[], layouts: unknown[], typeLayouts: unknown[]
beforeEach(() => {
  useAssembly.setState({ category: 'combat' })
  orders = []; layouts = []; typeLayouts = []
  vi.mocked(renderCard).mockReset().mockImplementation(async () => ({ canvas: document.createElement('canvas'), warnings: [], textPositions: {} as never }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  subtypes = [{ id: 5, category: 'combat', name: 'Level 0', layout: {}, overlays: [] }, { id: 1, category: 'combat', name: 'Elite', layout: {}, overlays: [{ id: 10, url: '/o/10' }, { id: 11, url: '/o/11' }] }, { id: 2, category: 'upgrade', name: 'Relic', layout: {}, overlays: [] }]
  server.use(
    http.get('/api/subtypes', () => HttpResponse.json(subtypes)),
    http.put('/api/subtypes/5/layout', async ({ request }) => { const { layout } = await request.json() as { layout: Subtype['layout'] }; layouts.push(layout); subtypes[0] = { ...subtypes[0], layout }; return HttpResponse.json(subtypes[0]) }),
    http.get('/api/factions', () => HttpResponse.json([{ id: 1, name: 'Tau' }])),
    http.get('/api/card-type-layouts', () => HttpResponse.json([])),
    http.put('/api/card-type-layouts/combat', async ({ request }) => { const { layout } = await request.json() as { layout: unknown }; typeLayouts.push(layout); return HttpResponse.json({ category: 'combat', layout }) }),
    http.get('/api/faction-logos', () => HttpResponse.json([{ faction_id: 1, url: '/logo' }])),
    http.get('/api/assembly-templates', () => HttpResponse.json([])),
    http.get('/api/generations', () => HttpResponse.json([])),
    http.get('/api/batch-items', () => HttpResponse.json([])),
    http.get('/api/card-types', () => HttpResponse.json([])),
    http.post('/api/subtypes', async ({ request }) => { const b = await request.json() as Subtype; const st = { ...b, id: 3, overlays: [] }; subtypes = [...subtypes, st]; return HttpResponse.json(st, { status: 201 }) }),
    http.put('/api/subtypes/1/overlays/order', async ({ request }) => { const { ids } = await request.json() as { ids: number[] }; orders.push(ids); subtypes[1] = { ...subtypes[1], overlays: ids.map(id => ({ id, url: `/o/${id}` })) }; return HttpResponse.json(subtypes[1]) }),
  )
})
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><SubtypesPage /></MemoryRouter></QueryClientProvider>)
}

test('moveOverlay swaps neighbours and ignores moves past either end', () => {
  expect(moveOverlay([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
  expect(moveOverlay([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
  expect(moveOverlay([1, 2, 3], 2, 1)).toEqual([1, 2, 3])
})

test('subtypes are listed per card type, created, and their overlays reordered', async () => {
  mount()
  const panel = await screen.findByRole('region', { name: 'Subtype Elite' })
  expect(screen.queryByRole('region', { name: 'Subtype Relic' })).not.toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: 'Move layer 1 up' }))
  await waitFor(() => expect(orders).toEqual([[11, 10]]))
  await userEvent.click(screen.getByRole('tab', { name: /Upgrades/ }))
  expect(await screen.findByRole('region', { name: 'Subtype Relic' })).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('New subtype name'), 'Artefact')
  await userEvent.click(screen.getByRole('button', { name: 'Add subtype' }))
  expect(await screen.findByRole('region', { name: 'Subtype Artefact' })).toBeInTheDocument()
  expect(subtypes.at(-1)).toMatchObject({ category: 'upgrade', name: 'Artefact' })
})

test('built-in level subtypes cannot be renamed or deleted', async () => {
  mount()
  const panel = await screen.findByRole('region', { name: 'Subtype Level 0' })
  expect(within(panel).getByText('built-in')).toBeInTheDocument()
  expect(within(panel).queryByRole('button', { name: 'Delete subtype' })).not.toBeInTheDocument()
  expect(within(panel).queryByLabelText('Subtype name')).not.toBeInTheDocument()
})

test('level 0 subtype positions resources and the logo on a preview and saves them', async () => {
  mount()
  const panel = await screen.findByRole('region', { name: 'Subtype Level 0' })
  await userEvent.click(within(panel).getByRole('button', { name: 'Edit positions' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ level: 0 }), logoUrl: '/logo' })))
  await userEvent.selectOptions(within(panel).getByLabelText('Layer'), 'logo')
  fireEvent.change(within(panel).getByLabelText('Start X (%)'), { target: { value: '7' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ logo: expect.objectContaining({ x: 7 }) }) })))
  await userEvent.selectOptions(within(panel).getByLabelText('Preview level'), '2')
  expect(within(panel).queryByRole('option', { name: 'Faction logo (level 0)' })).not.toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: 'Save positions' }))
  await waitFor(() => expect(layouts).toEqual([{ logo: expect.objectContaining({ x: 7 }) }]))
})

test('boxes are dragged on the preview and Cmd+Z / Shift+Cmd+Z undo and redo', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  mount()
  const panel = await screen.findByRole('region', { name: 'Subtype Level 0' })
  await userEvent.click(within(panel).getByRole('button', { name: 'Edit positions' }))
  const box = await within(panel).findByRole('button', { name: 'Drag Resource icons (guns, shields, morale)' })
  const startX = Number(within(panel).getByLabelText<HTMLInputElement>('Start X (%)').value)
  fireEvent.pointerDown(box, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(box, { clientX: 30, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(box, { clientX: 50, clientY: 10, pointerId: 1 })
  fireEvent.pointerUp(box, { pointerId: 1 })
  await waitFor(() => expect(within(panel).getByLabelText<HTMLInputElement>('Start X (%)').value).toBe(String(startX + 20)))
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
  await waitFor(() => expect(within(panel).getByLabelText<HTMLInputElement>('Start X (%)').value).toBe(String(startX)))
  fireEvent.keyDown(within(panel).getByLabelText('Start X (%)'), { key: 'z', metaKey: true, shiftKey: true })
  await waitFor(() => expect(within(panel).getByLabelText<HTMLInputElement>('Start X (%)').value).toBe(String(startX + 20)))
})

test('the resource column has no box to resize; its icon size is editable instead', async () => {
  mount()
  const panel = await screen.findByRole('region', { name: 'Subtype Level 0' })
  await userEvent.click(within(panel).getByRole('button', { name: 'Edit positions' }))
  await within(panel).findByRole('button', { name: 'Drag Resource icons (guns, shields, morale)' })
  expect(within(panel).queryByRole('button', { name: 'Resize Resource icons (guns, shields, morale)' })).not.toBeInTheDocument()
  expect(within(panel).queryByLabelText('Box width (%)')).not.toBeInTheDocument()
  fireEvent.change(within(panel).getByLabelText('Icon size (%)'), { target: { value: '8' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ resources: expect.objectContaining({ size: 8 }) }) })))
  await userEvent.selectOptions(within(panel).getByLabelText('Layer'), 'logo')
  expect(within(panel).getByRole('button', { name: 'Resize Faction logo (starting cards)' })).toBeInTheDocument()
})

test('the preview resource price can be changed for levels 1–3', async () => {
  mount()
  const panel = await screen.findByRole('region', { name: 'Subtype Level 0' })
  await userEvent.click(within(panel).getByRole('button', { name: 'Edit positions' }))
  expect(await within(panel).findByLabelText('Preview price')).toBeDisabled()
  await userEvent.selectOptions(within(panel).getByLabelText('Preview level'), '1')
  await userEvent.selectOptions(within(panel).getByLabelText('Preview price'), '10')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ level: 1, resource_cost: 10 }) })))
})

test('the card type text layout positions the title and rules text for every card of the type', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  mount()
  const section = (await screen.findByText('Combat text layout')).closest('details')!
  const layer = await within(section).findByLabelText('Layer')
  expect(within(layer).getAllByRole('option').map(o => o.textContent)).toEqual(['Title', 'Upper text', 'Lower text'])
  await userEvent.selectOptions(layer, 'upper_text')
  const box = within(section).getByRole('button', { name: 'Drag Upper text' })
  fireEvent.pointerDown(box, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(box, { clientX: 10, clientY: 50, pointerId: 1 })
  fireEvent.pointerUp(box, { pointerId: 1 })
  expect(within(section).getByLabelText('Automatic vertical position (centred in its panel)')).not.toBeChecked()
  await userEvent.click(within(section).getByRole('button', { name: 'Save positions' }))
  await waitFor(() => expect(typeLayouts).toEqual([{ upper_text: expect.objectContaining({ autoY: false }) }]))
})

test('the layout preview uses the faction template, or its newest matching image when none is chosen', async () => {
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'combat', overlay_path: '' }, { id: 4, name: 'upgrade', overlay_path: '' }])),
    http.get('/api/generations', () => HttpResponse.json([
      { id: 8, name: 'Upgrade art', status: 'done', card_type_id: 4, faction_id: 1, image_path: 'u.png', created_at: '2026-03' },
      { id: 7, name: 'Newest combat', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'n.png', created_at: '2026-02' },
      { id: 6, name: 'Older combat', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'o.png', created_at: '2026-01' },
    ])),
  )
  mount()
  const section = (await screen.findByText('Combat text layout')).closest('details')!
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/generations/7/image' })))
  expect(within(section).getByText(/Template: Newest combat \(newest image/)).toBeInTheDocument()
  server.use(http.get('/api/assembly-templates', () => HttpResponse.json([{ faction_id: 1, category: 'combat', image_key: 'test-6' }])))
  cleanup(); mount()
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/generations/6/image' })))
})
