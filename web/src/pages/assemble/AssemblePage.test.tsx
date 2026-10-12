import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import type { Card, CardInput } from '../cards/model'
import { renderCard } from './render'
import { useAssembly } from './state'
import { emptyAssembly, layoutScopeKey, type Assembly } from './api'
import type { Layout } from './model'
import AssemblePage from './AssemblePage'
vi.mock('./render', () => ({ renderCard: vi.fn(), pngBlob: vi.fn(), loadFonts: vi.fn().mockResolvedValue(undefined), paintRun: vi.fn() }))
const initial: Card = { id: 1, faction_id: 1, category: 'combat', name: 'Winged Horror', level: 0, resource_cost: 2, guns: 2, shields: 0, eagles: 0, upper_text: 'Gain 3 [GUN].', lower_text: 'Gain 2 [SKULL].', created_at: '', updated_at: '' }
let records: Card[], updates: unknown[]
let assemblies: Record<string, Assembly>, assemblyUpdates: unknown[]
let sharedLayouts: Record<string, Partial<Layout>>, layoutUpdates: unknown[]
const scope = layoutScopeKey({ template_key: 'test-5', faction_id: 1, card_type_id: 3 })
function requestScope(request: Request) { const q = new URL(request.url).searchParams; return layoutScopeKey({ template_key: q.get('template_key')!, faction_id: Number(q.get('faction_id')), card_type_id: Number(q.get('card_type_id')) }) }
beforeEach(() => {
  useAssembly.setState({ cardId: '', imageKey: '', overlayId: 'auto', edits: {}, layouts: {}, assemblies: {} })
  assemblies = {}; assemblyUpdates = []; sharedLayouts = {}; layoutUpdates = []
  records = [{ ...initial }, { ...initial, id: 2, name: 'Second card' }]; updates = []
  vi.mocked(renderCard).mockReset().mockImplementation(async input => ({ canvas: document.createElement('canvas'), warnings: [], textPositions: { upper_text: input.layout.upper_text, lower_text: input.layout.lower_text } }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  server.use(
    http.get('/api/assembly-layout', ({ request }) => HttpResponse.json({ layout: sharedLayouts[requestScope(request)] ?? {} })),
    http.put('/api/assembly-layout', async ({ request }) => { const a = await request.json() as { layout: Layout }; sharedLayouts[requestScope(request)] = a.layout; layoutUpdates.push({ key: requestScope(request), ...a }); return HttpResponse.json(a) }),
    http.get('/api/cards/:id/assembly', ({ params }) => HttpResponse.json(assemblies[String(params.id)] ?? emptyAssembly())),
    http.put('/api/cards/:id/assembly', async ({ params, request }) => { const a = await request.json() as Assembly; assemblyUpdates.push(a); assemblies[String(params.id)] = { ...a, image_url: `/api/cards/${params.id}/artwork?v=saved` }; return HttpResponse.json(assemblies[String(params.id)]) }),
    http.get('/api/cards', () => HttpResponse.json(records)),
    http.get('/api/factions', () => HttpResponse.json([{ id: 1, name: 'Tau' }])),
    http.get('/api/card-types', () => HttpResponse.json([{ id: 3, name: 'Battle', overlay_path: 'frame.png' }, { id: 4, name: 'Other type', overlay_path: 'other.png' }])),
    http.get('/api/generations', () => HttpResponse.json([{ id: 5, name: 'Generated art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'art.png', created_at: '2026' }])),
    http.get('/api/batch-items', () => HttpResponse.json([{ id: 6, batch_id: 2, name: 'Batch art', status: 'done', card_type_id: 3, faction_id: 1, image_path: 'batch.png', completed_at: '2025' }])),
    http.put('/api/cards/:id', async ({ request, params }) => { const input = await request.json() as CardInput; updates.push(input); const saved = { ...input, id: Number(params.id), created_at: '', updated_at: '' }; records = records.map(c => c.id === saved.id ? saved : c); return HttpResponse.json(saved) }),
  )
})
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><RouterProvider router={createMemoryRouter([{ path: '/assemble', element: <AssemblePage /> }], { initialEntries: ['/assemble'] })} /></QueryClientProvider>)
}
async function select() {
  mount()
  await screen.findByRole('option', { name: 'Winged Horror — Tau' })
  await userEvent.selectOptions(screen.getByLabelText('Combat card'), '1')
  await userEvent.click(await screen.findByRole('button', { name: 'Choose image Generated art' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PNG' })).toBeEnabled())
}
test('single and batch artwork share the overlay picker and preview renderer', async () => {
  await select()
  expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/generations/5/image', overlayUrl: '/api/card-types/3/overlay?v=frame.png' }))
  await userEvent.click(screen.getByRole('button', { name: 'Choose image Batch art' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/batches/2/items/6/image' })))
  await userEvent.selectOptions(screen.getByLabelText('Overlay'), 'none')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ overlayUrl: null })))
})
test('text is previewed before explicit save, invalid counts disable export and save', async () => {
  await select()
  fireEvent.change(screen.getByLabelText('Upper text'), { target: { value: 'New [MORALE]' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ upper_text: 'New [MORALE]' }) })))
  expect(updates).toEqual([])
  fireEvent.change(screen.getByLabelText('Guns'), { target: { value: '-1' } })
  expect(screen.getByRole('button', { name: 'Download PNG' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Save to card' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Guns'), { target: { value: '3' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save to card' }))
  await screen.findByText('Card saved to database.')
  expect(updates[0]).toMatchObject({ category: 'combat', guns: 3, upper_text: 'New [MORALE]' })
  expect(updates[0]).not.toHaveProperty('id')
})
test('positions rerender without saving card content, and card switches retain drafts', async () => {
  await select()
  fireEvent.change(screen.getByLabelText('Start Y (%)'), { target: { value: '75' } })
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ upper_text: expect.objectContaining({ y: 75 }) }) })))
  expect(updates).toEqual([])
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Draft title' } })
  await userEvent.selectOptions(screen.getByLabelText('Combat card'), '2')
  expect(screen.getByLabelText('Title')).toHaveValue('Second card')
  await userEvent.selectOptions(screen.getByLabelText('Combat card'), '1')
  expect(screen.getByLabelText('Title')).toHaveValue('Draft title')
  expect(screen.getByLabelText('Start Y (%)')).toHaveValue('75')
})
test('a failed render disables export and can be retried', async () => {
  vi.mocked(renderCard).mockRejectedValueOnce(new Error('Could not load artwork'))
  mount(); await screen.findByRole('option', { name: 'Winged Horror — Tau' })
  await userEvent.selectOptions(screen.getByLabelText('Combat card'), '1')
  await userEvent.click(screen.getByRole('button', { name: 'Choose image Generated art' }))
  await screen.findByText('Could not load artwork')
  expect(screen.getByRole('button', { name: 'Download PNG' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry rendering' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download PNG' })).toBeEnabled())
})

test('position inputs accept decimal commas and can be cleared while editing', async () => {
  await select()
  const input = screen.getByLabelText('Start Y (%)')
  fireEvent.change(input, { target: { value: '' } })
  expect(input).toHaveValue('')
  fireEvent.change(input, { target: { value: '76,4' } })
  await waitFor(() => expect(useAssembly.getState().layouts[scope].upper_text.y).toBe(76.4))
})

test('symbol picker inserts the selected distinct glyph token at the cursor', async () => {
  await select()
  const input = screen.getByLabelText('Upper text') as HTMLTextAreaElement
  input.focus(); input.setSelectionRange(7, 12)
  await userEvent.click(screen.getByText('Insert resource symbol'))
  await userEvent.click(screen.getByRole('button', { name: 'Insert Boltgun — boxed' }))
  expect(input).toHaveValue('Gain 3 [B].')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ upper_text: 'Gain 3 [B].' }) })))
  expect(updates).toEqual([])
})
test('resource columns expose only their font variants and retain separate choices', async () => {
  await select()
  await userEvent.selectOptions(screen.getByLabelText('Position controls for'), 'guns')
  const gunOptions = [...(screen.getByLabelText('Icon style') as HTMLSelectElement).options].map(o => o.value)
  expect(gunOptions).toEqual(['plain', 'circle', 'circle_outline', 'box', 'box_outline'])
  await userEvent.selectOptions(screen.getByLabelText('Icon style'), 'box')
  expect(useAssembly.getState().layouts[scope].guns.iconStyle).toBe('box')
  await userEvent.selectOptions(screen.getByLabelText('Position controls for'), 'eagles')
  expect([...(screen.getByLabelText('Icon style') as HTMLSelectElement).options].map(o => o.value)).toEqual(['plain', 'box', 'box_outline'])
  await userEvent.selectOptions(screen.getByLabelText('Icon style'), 'box_outline')
  expect(useAssembly.getState().layouts[scope].eagles.iconStyle).toBe('box_outline')
  expect(useAssembly.getState().layouts[scope].guns.iconStyle).toBe('box')
})

test('manual rules positions can return to automatic placement', async () => {
  await select()
  expect(screen.getByLabelText('Automatic vertical position')).toBeChecked()
  fireEvent.change(screen.getByLabelText('Start Y (%)'), { target: { value: '70' } })
  expect(screen.getByLabelText('Automatic vertical position')).not.toBeChecked()
  expect(useAssembly.getState().layouts[scope].upper_text.autoY).toBe(false)
  await userEvent.click(screen.getByLabelText('Automatic vertical position'))
  expect(useAssembly.getState().layouts[scope].upper_text.autoY).toBe(true)
})

test('artwork saves per card while layout saves for the template combination', async () => {
  assemblies['2'] = { ...emptyAssembly(), image_key: 'upload', image_url: '/api/cards/2/artwork?v=uploaded', overlay_id: 'none', transform: { scale: 2, x: 12, y: -5 } }
  await select()
  fireEvent.change(screen.getByLabelText('Artwork scale'), { target: { value: '1.5' } })
  fireEvent.change(screen.getByLabelText('Artwork X (%)'), { target: { value: '10' } })
  fireEvent.change(screen.getByLabelText('Start Y (%)'), { target: { value: '75' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save assembly' }))
  await screen.findByText('Assembly saved to database.')
  expect(assemblyUpdates[0]).toMatchObject({ image_key: 'test-5', overlay_id: '3', transform: { scale: 1.5, x: 10, y: 0 }, layout: {} })
  expect(layoutUpdates[0]).toMatchObject({ key: scope, layout: { upper_text: { y: 75 } } })
  expect(useAssembly.getState().layouts[scope]).toBeUndefined()
  expect(useAssembly.getState().assemblies['1']).toBeUndefined()
  await userEvent.selectOptions(screen.getByLabelText('Combat card'), '2')
  await waitFor(() => expect(screen.getByLabelText('Artwork scale')).toHaveValue('2'))
  expect(screen.getByLabelText('Artwork X (%)')).toHaveValue('12')
  await userEvent.selectOptions(screen.getByLabelText('Combat card'), '1')
  await waitFor(() => expect(screen.getByLabelText('Artwork scale')).toHaveValue('1.5'))
  expect(screen.getByLabelText('Start Y (%)')).toHaveValue('75')
})


test('cards share positions for the same template, but other templates and types have separate layouts', async () => {
  await select()
  fireEvent.change(screen.getByLabelText('Start Y (%)'), { target: { value: '73' } })
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Only first card' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save assembly' }))
  await screen.findByText('Assembly saved to database.')
  await userEvent.selectOptions(screen.getByLabelText('Combat card'), '2')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Choose image Generated art' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Choose image Generated art' }))
  await waitFor(() => expect(screen.getByLabelText('Start Y (%)')).toHaveValue('73'))
  expect(screen.getByLabelText('Title')).toHaveValue('Second card')
  expect(screen.getByLabelText('Artwork scale')).toHaveValue('1')
  await userEvent.click(screen.getByRole('button', { name: 'Choose image Batch art' }))
  await waitFor(() => expect(screen.getByLabelText('Start Y (%)')).toHaveValue('77.1'))
  await userEvent.click(screen.getByRole('button', { name: 'Choose image Generated art' }))
  await waitFor(() => expect(screen.getByLabelText('Start Y (%)')).toHaveValue('73'))
  await userEvent.selectOptions(screen.getByLabelText('Overlay'), '4')
  await waitFor(() => expect(screen.getByLabelText('Start Y (%)')).toHaveValue('77.1'))
  await userEvent.selectOptions(screen.getByLabelText('Overlay'), '3')
  await waitFor(() => expect(screen.getByLabelText('Start Y (%)')).toHaveValue('73'))
})
