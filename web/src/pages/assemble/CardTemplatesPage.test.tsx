import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useAssembly } from './state'
import CardTemplatesPage from './CardTemplatesPage'
import { renderCard } from './render'
vi.mock('./render', () => ({ renderCard: vi.fn(), loadFonts: vi.fn().mockResolvedValue(undefined), paintRun: vi.fn() }))

let typeLayouts: unknown[]
beforeEach(() => {
  useAssembly.setState({ category: 'combat' })
  typeLayouts = []
  vi.mocked(renderCard).mockReset().mockImplementation(async () => ({ canvas: document.createElement('canvas'), warnings: [], textPositions: {} as never }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  server.use(
    http.get('/api/nebulas', () => HttpResponse.json([])),
    http.get('/api/nebula-placements', () => HttpResponse.json([])),
    http.get('/api/reference-cards', () => HttpResponse.json([])),
    http.get('/api/factions', () => HttpResponse.json([{ id: 1, name: 'Tau' }])),
    http.get('/api/card-type-layouts', () => HttpResponse.json([])),
    http.put('/api/card-type-layouts/combat', async ({ request }) => { const { layout } = await request.json() as { layout: unknown }; typeLayouts.push(layout); return HttpResponse.json({ category: 'combat', layout }) }),
    http.get('/api/faction-logos', () => HttpResponse.json([{ faction_id: 1, url: '/logo' }])),
    http.get('/api/assembly-templates', () => HttpResponse.json([])),
    http.get('/api/generations', () => HttpResponse.json([])),
    http.get('/api/card-types', () => HttpResponse.json([])),
  )
})
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CardTemplatesPage /></MemoryRouter></QueryClientProvider>)
}
const front = async () => (await screen.findByText('Combat front layout')).closest('details')!

test('the combat layout positions the level, price, resources and the logo, and saves them', async () => {
  mount()
  const section = await front()
  const layer = await within(section).findByLabelText('Layer')
  expect(within(layer).getAllByRole('option').map(o => o.textContent)).toEqual(['Title', 'Level icon', 'Level', 'Resource gear icon', 'Resource price', 'Resource icons (guns, shields, morale)', 'Upper text', 'Lower text'])
  await userEvent.selectOptions(layer, 'resources')
  fireEvent.change(within(section).getByLabelText('Start X (%)'), { target: { value: '7' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ resources: expect.objectContaining({ x: 7 }) }) })))
  // A starting card shows the faction logo instead of a level and price.
  await userEvent.click(within(section).getByRole('tab', { name: 'Starting' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ level: 0, starting: true }), logoUrl: '/logo' })))
  expect(within(within(section).getByLabelText('Layer')).getAllByRole('option').map(o => o.textContent)).toEqual(['Title', 'Faction logo (starting cards)', 'Resource icons (guns, shields, morale)', 'Upper text', 'Lower text'])
  await userEvent.click(within(section).getByRole('button', { name: 'Save positions' }))
  await waitFor(() => expect(typeLayouts).toEqual([{ resources: expect.objectContaining({ x: 7 }) }]))
})

test('boxes are dragged on the preview and Cmd+Z / Shift+Cmd+Z undo and redo', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  mount()
  const section = await front()
  await userEvent.selectOptions(await within(section).findByLabelText('Layer'), 'resources')
  const box = await within(section).findByRole('button', { name: 'Drag Resource icons (guns, shields, morale)' })
  const startX = Number(within(section).getByLabelText<HTMLInputElement>('Start X (%)').value)
  fireEvent.pointerDown(box, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(box, { clientX: 30, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(box, { clientX: 50, clientY: 10, pointerId: 1 })
  fireEvent.pointerUp(box, { pointerId: 1 })
  await waitFor(() => expect(within(section).getByLabelText<HTMLInputElement>('Start X (%)').value).toBe(String(startX + 20)))
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
  await waitFor(() => expect(within(section).getByLabelText<HTMLInputElement>('Start X (%)').value).toBe(String(startX)))
  fireEvent.keyDown(within(section).getByLabelText('Start X (%)'), { key: 'z', metaKey: true, shiftKey: true })
  await waitFor(() => expect(within(section).getByLabelText<HTMLInputElement>('Start X (%)').value).toBe(String(startX + 20)))
})

test('the resource column has a box its icons are centred across, edited by number; its icon size is editable too', async () => {
  mount()
  const section = await front()
  await userEvent.selectOptions(await within(section).findByLabelText('Layer'), 'resources')
  await within(section).findByRole('button', { name: 'Drag Resource icons (guns, shields, morale)' })
  expect(within(section).queryByRole('button', { name: 'Resize Resource icons (guns, shields, morale)' })).not.toBeInTheDocument()
  expect(within(section).getByLabelText('Box width (%)')).toBeInTheDocument()
  fireEvent.change(within(section).getByLabelText('Icon size (%)'), { target: { value: '8' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ resources: expect.objectContaining({ size: 8 }) }) })))
})

test('the level and resource icons are boxes that can be moved and resized', async () => {
  mount()
  const section = await front()
  await userEvent.selectOptions(await within(section).findByLabelText('Layer'), 'level_icon')
  expect(await within(section).findByRole('button', { name: 'Resize Level icon' })).toBeInTheDocument()
  fireEvent.change(within(section).getByLabelText('Box width (%)'), { target: { value: '25' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ level_icon: expect.objectContaining({ width: 25 }) }) })))
})

test('the preview resource price can be changed for levels 1–3', async () => {
  mount()
  const section = await front()
  await userEvent.click(await within(section).findByRole('tab', { name: 'Starting' }))
  expect(within(section).getByLabelText('Preview price')).toBeDisabled()
  expect(within(section).queryByLabelText('Preview level')).not.toBeInTheDocument()
  await userEvent.click(within(section).getByRole('tab', { name: 'Advanced' }))
  fireEvent.change(within(section).getByLabelText('Preview level'), { target: { value: '1' } })
  fireEvent.change(within(section).getByLabelText('Preview price'), { target: { value: '10' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ level: 1, resource_cost: 10 }) })))
})

test('the card type text layout positions the title and rules text for every card of the type', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  mount()
  const section = (await screen.findByText('Combat front layout')).closest('details')!
  const layer = await within(section).findByLabelText('Layer')
  expect(within(layer).getAllByRole('option').map(o => o.textContent)).toContain('Upper text')
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
  const section = (await screen.findByText('Combat front layout')).closest('details')!
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/generations/7/image' })))
  expect(within(section).getByText(/Template: Newest combat \(newest image/)).toBeInTheDocument()
  server.use(http.get('/api/assembly-templates', () => HttpResponse.json([{ faction_id: 1, category: 'combat', image_key: 'test-6' }])))
  cleanup(); mount()
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/generations/6/image' })))
})
