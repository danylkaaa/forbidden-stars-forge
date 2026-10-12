import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import { useFactionLab } from './store'
import { usePreviewLayers } from '../../lib/previewLayers'
import FactionLabPage from './FactionLabPage'
import { renderCard } from '../assemble/render'
import { DEMO_ARTWORK } from '../assemble/demoArtwork'
vi.mock('../assemble/render', () => ({ renderCard: vi.fn(), loadFonts: vi.fn().mockResolvedValue(undefined), paintRun: vi.fn() }))

const faction = {
  id: 1, name: 'Sisters', dlc: 'Symphony of War', primary_color: 'black', texture: 'ceramite',
  description: 'gothic', created_at: 'a', updated_at: 'b',
}
const cardTypes = [
  { id: 1, name: 'combat', description: '', constraints: 'fill green', template_path: 't', openai_file_id: 'file-1', overlay_path: 'overlays/o.png', created_at: 'a', updated_at: 'b' },
]
const gen = { faction_id: 1, card_type_id: 1, mode: 'draft', model: '', quality: 'low', name: '1-sisters-combat-low', favorite: false, input_tokens: 0, output_tokens: 0, cost_usd: 0.015, duration_ms: 1000, error: '', created_at: '2026-10-12 10:00:00' }

let assembled: Record<string, unknown>[] = []
let saved: Record<string, unknown> | null = null
let generated: Record<string, unknown>[] = []
let gens: unknown[] = []
let ctSaved = false

function renderAt(url = '/faction-lab?faction=1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}><FactionLabPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  assembled = []
  saved = null
  generated = []
  gens = []
  ctSaved = false
  usePreviewLayers.setState({ mask: false, maskOpacity: 0.5 })
  useFactionLab.setState({ factionId: null, cardTypeId: 1, mode: 'draft', model: '', drafts: {}, snapshots: {}, ctDrafts: {}, ctSnapshots: {} })
  server.use(
    http.get('/api/factions', () => HttpResponse.json([faction])),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
    http.get('/api/batch-items', () => HttpResponse.json([])),
    http.get('/api/assembly-templates', () => HttpResponse.json([])),
    http.get('/api/generations', () => HttpResponse.json(gens)),
    http.get('/api/generate/preview', () => HttpResponse.json({ prompt: 'saved prompt', has_file: true, est_draft_usd: 0.015, est_final_usd: 0.048 })),
    http.post('/api/generate/assemble', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      assembled.push(body)
      return HttpResponse.json({ prompt: `## Primary color\n${body.primary_color}\n\n## Faction style\n${body.description}`, has_file: true })
    }),
    http.post('/api/generate', async ({ request }) => {
      generated.push((await request.json()) as Record<string, unknown>)
      const g = { ...gen, id: 50, status: 'pending', prompt: 'x', image_path: '' }
      gens = [g, ...gens]
      return HttpResponse.json(g, { status: 201 })
    }),
    http.put('/api/card-types/1', () => {
      ctSaved = true
      return HttpResponse.json(cardTypes[0])
    }),
    http.put('/api/factions/1', async ({ request }) => {
      saved = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...faction, ...saved })
    }),
  )
})

const prompt = () => screen.getByLabelText('Assembled prompt')

test('editing fields re-assembles the prompt without saving; generate sends that prompt', async () => {
  renderAt()
  await waitFor(() => expect(prompt()).toHaveTextContent('## Primary color black'))
  const color = screen.getByLabelText('Primary color')
  await userEvent.clear(color)
  await userEvent.type(color, 'crimson')
  await waitFor(() => expect(prompt()).toHaveTextContent('## Primary color crimson'))
  expect(screen.getByText('Unsaved experiment')).toBeInTheDocument()
  expect(saved).toBeNull()

  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(generated).toHaveLength(1))
  expect(generated[0]).toMatchObject({ faction_id: 1, card_type_id: 1, mode: 'draft', prompt_override: '## Primary color\ncrimson\n\n## Faction style\ngothic' })
  expect(saved).toBeNull() // still not saved
  expect(useFactionLab.getState().snapshots[50]).toEqual({ primary_color: 'crimson', texture: 'ceramite', description: 'gothic' })
})

test('save to faction writes the experiment; reset discards it', async () => {
  renderAt()
  const texture = await screen.findByLabelText('Texture')
  await userEvent.clear(texture)
  await userEvent.type(texture, 'bone')
  await userEvent.click(screen.getByRole('button', { name: 'Reset to saved' }))
  expect(screen.getByLabelText('Texture')).toHaveValue('ceramite')

  await userEvent.type(screen.getByLabelText('Texture'), ' and gold')
  await userEvent.click(screen.getByRole('button', { name: 'Save to faction' }))
  await waitFor(() => expect(saved).toMatchObject({
    name: 'Sisters', dlc: 'Symphony of War', primary_color: 'black', texture: 'ceramite and gold', description: 'gothic', source: 'manual',
  }))
})

test('a result made with other fields can be restored into the editor', async () => {
  gens = [{ ...gen, id: 40, status: 'done', prompt: 'p', image_path: 'x' }]
  useFactionLab.setState({ snapshots: { 40: { primary_color: 'ivory', texture: 'marble', description: 'serene' } } })
  renderAt()
  await screen.findByText('lab experiment')
  await userEvent.click(screen.getByRole('button', { name: 'Use these fields' }))
  expect(screen.getByLabelText('Primary color')).toHaveValue('ivory')
  expect(screen.getByLabelText('Texture')).toHaveValue('marble')
  expect(screen.getByText('current fields')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Use these fields' })).not.toBeInTheDocument()
})

test('the newest run is shown on the right; thumbnails switch the shown run', async () => {
  gens = [
    { ...gen, id: 42, status: 'pending', prompt: 'p', image_path: '' },
    { ...gen, id: 41, status: 'done', prompt: 'p', image_path: 'x' },
  ]
  renderAt()
  expect(await screen.findByText('generating…')).toBeInTheDocument()
  expect(screen.getAllByRole('status', { name: 'Generating' }).length).toBeGreaterThan(0) // spinner
  await userEvent.click(screen.getByRole('button', { name: 'Show run #41' }))
  expect(screen.getByRole('button', { name: 'Open Sisters × combat #41' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Show run #41' })).toHaveAttribute('aria-pressed', 'true')
})

test('a new generation becomes the shown run', async () => {
  gens = [{ ...gen, id: 41, status: 'done', prompt: 'p', image_path: 'x' }]
  renderAt()
  await screen.findByRole('button', { name: 'Open Sisters × combat #41' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByText('generating…')).toBeInTheDocument()
})

test('result preview has an inline mask control and no overlay layer', async () => {
  gens = [{ ...gen, id: 41, status: 'done', prompt: 'p', image_path: 'x' }]
  renderAt()
  await screen.findByRole('button', { name: 'Open Sisters × combat #41' })
  expect(screen.queryByRole('button', { name: /Overlay/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Mask off' }))
  expect(screen.getByTestId('mask').getAttribute('src')).toMatch(/^\/api\/card-types\/1\/template/)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // toggles don't open the lightbox
})

test('card type tab: unsaved constraints feed the prompt and the snapshot; save writes the card type', async () => {
  renderAt()
  await waitFor(() => expect(prompt()).toHaveTextContent('## Primary color black'))
  await userEvent.click(screen.getByRole('tab', { name: 'Card type' }))
  const constraints = screen.getByLabelText('Constraints')
  expect(constraints).toHaveValue('fill green')
  await userEvent.type(constraints, ' and keep banner')
  await waitFor(() => expect(assembled.at(-1)).toMatchObject({ card_type_constraints: 'fill green and keep banner', card_type_description: '' }))
  expect(screen.getByRole('tab', { name: /Card type/ })).toHaveTextContent('•')
  expect(ctSaved).toBe(false)

  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(useFactionLab.getState().ctSnapshots[50]).toEqual({ description: '', constraints: 'fill green and keep banner' }))

  await userEvent.click(screen.getByRole('button', { name: 'Save to card type' }))
  await waitFor(() => expect(ctSaved).toBe(true))
})

test('a finished run can be previewed as a card with an existing card of the faction', async () => {
  vi.mocked(renderCard).mockReset().mockImplementation(async () => ({ canvas: document.createElement('canvas'), warnings: [], textPositions: {} as never }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  gens = [{ ...gen, id: 41, status: 'done', prompt: 'p', image_path: 'x' }]
  server.use(
    http.get('/api/cards', () => HttpResponse.json([{ id: 7, faction_id: 1, category: 'combat', name: 'Purge', level: 1, resource_cost: 2, guns: 1, shields: 0, eagles: 0, upper_text: 'u', lower_text: '', created_at: '', updated_at: '' }])),
    http.get('/api/cards/7/assembly', () => HttpResponse.json({ image_key: 'upload', image_url: '/api/cards/7/artwork?v=a', overlay_id: 'auto', subtype_id: 0, transform: { scale: 1.5, x: 3, y: 0 }, layout: {} })),
    http.get('/api/card-type-layouts', () => HttpResponse.json([])),
    http.get('/api/subtypes', () => HttpResponse.json([])),
    http.get('/api/faction-logos', () => HttpResponse.json([])),
  )
  renderAt()
  await userEvent.click(await screen.findByRole('tab', { name: 'Card preview' }))
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/generations/41/image', card: expect.objectContaining({ name: 'Righteous Fury' }) })))
  await userEvent.selectOptions(screen.getByLabelText('Preview with card'), '7')
  await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Purge' }), artworkUrl: '/api/cards/7/artwork?v=a', artwork: { scale: 1.5, x: 3, y: 0 } })))
})


test('back generation attaches a selected lab or batch front and clears it when the pair changes', async () => {
  const back = { ...cardTypes[0], id: 2, name: 'combat back' }
  gens = [
    { ...gen, id: 41, name: 'lab-front', status: 'done', image_path: 'front' },
    { ...gen, id: 42, status: 'pending' },
    { ...gen, id: 43, faction_id: 99, status: 'done' },
    { ...gen, id: 44, card_type_id: 2, status: 'done' },
  ]
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([...cardTypes, back])),
    http.get('/api/batch-items', () => HttpResponse.json([{ ...gen, id: 9, batch_id: 3, status: 'done', name: 'batch-front' }])),
    http.get('/api/assembly-templates', () => HttpResponse.json([
      { faction_id: 99, category: 'combat', image_key: 'test-41' },
      { faction_id: 1, category: 'combat', side: 'back', image_key: 'test-41' },
      { faction_id: 1, category: 'combat', side: 'front', image_key: 'batch-9' },
    ])),
  )
  renderAt('/faction-lab?faction=1&card_type=2')
  await userEvent.click(await screen.findByRole('button', { name: 'Choose front image' }))
  const popup = screen.getByRole('dialog', { name: 'Choose front image' })
  await waitFor(() => expect(within(popup).getAllByRole('button', { name: /^Use (lab-front|batch-front)$/ })).toHaveLength(2))
  await waitFor(() => expect(within(popup).getByText('Current faction front')).toBeInTheDocument())
  expect(within(popup).getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual(['/api/batches/3/items/9/image', '/api/generations/41/image'])
  expect(within(popup).getByRole('button', { name: 'Use batch-front' })).toHaveTextContent('Current faction front')
  expect(within(popup).getByRole('button', { name: 'Use lab-front' })).not.toHaveTextContent('Current faction front')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Choose front image' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose front image' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Choose front image' }))
  await userEvent.click(screen.getByRole('button', { name: 'Use lab-front' }))
  expect(screen.queryByRole('dialog', { name: 'Choose front image' })).not.toBeInTheDocument()
  expect(screen.getByAltText('Selected front reference')).toHaveAttribute('src', '/api/generations/41/image')
  await waitFor(() => expect(assembled.at(-1)).toMatchObject({ has_front_image: true }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(generated.at(-1)).toMatchObject({ front_image: { kind: 'generation', id: 41 } }))
  await userEvent.click(screen.getByAltText('Selected front reference'))
  await userEvent.click(screen.getByRole('button', { name: 'Use batch-front' }))
  await userEvent.click(screen.getByAltText('Selected front reference'))
  expect(screen.getByRole('button', { name: 'Use batch-front' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Use batch-front' })).toHaveTextContent('Selected reference')
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Choose front image' })).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(generated.at(-1)).toMatchObject({ front_image: { kind: 'batch-item', id: 9, batch_id: 3 } }))
  await userEvent.selectOptions(screen.getByLabelText('Card Type'), '1')
  expect(screen.queryByRole('button', { name: 'Choose front image' })).not.toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Card Type'), '2')
  expect(screen.getByRole('button', { name: 'Choose front image' })).toBeInTheDocument()
  expect(screen.queryByAltText('Selected front reference')).not.toBeInTheDocument()
  await waitFor(() => expect(assembled.at(-1)).toMatchObject({ has_front_image: false }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(generated).toHaveLength(3))
  expect(generated.at(-1)).not.toHaveProperty('front_image')
})


test.each(['combat', 'combat back'])('%s opens a 3D preview on the generated side', async (name) => {
  vi.mocked(renderCard).mockReset().mockImplementation(async () => ({ canvas: document.createElement('canvas'), warnings: [], textPositions: {} as never }))
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,assembled-front')

  gens = [{ ...gen, id: 41, status: 'done', prompt: 'p', image_path: 'x' }]
  server.use(
    http.get('/api/card-types', () => HttpResponse.json([{ ...cardTypes[0], name }])),
    http.get('/api/assembly-templates', () => HttpResponse.json([])),
    http.get('/api/batch-items', () => HttpResponse.json([])),
    http.get('/api/cards', () => HttpResponse.json([{ id: 7, faction_id: 1, category: 'combat', name: 'Purge', level: 1, resource_cost: 2, guns: 1, shields: 0, eagles: 0, upper_text: 'u', lower_text: '', created_at: '', updated_at: '' }])),
    http.get('/api/cards/7/assembly', () => HttpResponse.json({ image_url: '/api/cards/7/artwork', subtype_id: 0, transform: { scale: 1.5, x: 3, y: 0 }, layout: {} })),
    http.get('/api/card-type-layouts', () => HttpResponse.json([])),
    http.get('/api/subtypes', () => HttpResponse.json([])),
    http.get('/api/faction-logos', () => HttpResponse.json([])),
  )
  renderAt()
  const title = `Sisters × ${name} #41`
  await userEvent.click(await screen.findByRole('button', { name: `3D preview of ${title}` }))
  const viewer = screen.getByRole('dialog', { name: `3D preview of ${title}` })
  const side = name === 'combat' ? 'front' : 'back'
  if (side === 'front') {
    await waitFor(() => expect(within(viewer).getByRole('img', { name: `${title} front` })).toHaveAttribute('src', 'data:image/png;base64,assembled-front'))
    expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: '/api/generations/41/image', card: expect.objectContaining({ id: 0 }) }))
    const demoArtwork = vi.mocked(renderCard).mock.calls.at(-1)![0].artworkUrl
    expect(DEMO_ARTWORK).toContain(demoArtwork)
    await userEvent.selectOptions(within(viewer).getByLabelText('Preview with card'), '7')
    await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ name: 'Purge' }), artworkUrl: '/api/cards/7/artwork' })))
    await userEvent.selectOptions(within(viewer).getByLabelText('Preview with card'), '0')
    await waitFor(() => expect(renderCard).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ id: 0 }), artworkUrl: expect.any(String) })))
    expect(vi.mocked(renderCard).mock.calls.at(-1)![0].artworkUrl).toBe(demoArtwork)
  } else {
    expect(within(viewer).getByRole('img', { name: `${title} back` })).toHaveAttribute('src', '/api/generations/41/image')
  }
  const rotation = side === 'front' ? 'rotateY(-22deg)' : 'rotateY(158deg)'
  expect(within(viewer).getByTestId('card-3d').style.transform).toContain(rotation)
  await userEvent.click(within(viewer).getByRole('button', { name: 'Flip' }))
  await userEvent.click(within(viewer).getByRole('button', { name: 'Reset' }))
  expect(within(viewer).getByTestId('card-3d').style.transform).toContain(rotation)
  await userEvent.click(within(viewer).getByRole('button', { name: 'Close' }))
  await userEvent.click(screen.getByRole('button', { name: `Open ${title}` }))
  const lightbox = screen.getByRole('dialog', { name: title })
  await userEvent.click(within(lightbox).getByRole('button', { name: `3D preview of ${title}` }))
  expect(screen.getByRole('dialog', { name: `3D preview of ${title}` })).toBeInTheDocument()
  if (side === 'back') {
    expect(screen.queryByRole('tab', { name: 'Card preview' })).not.toBeInTheDocument()
    expect(within(lightbox).queryByRole('button', { name: 'Card preview' })).not.toBeInTheDocument()
  }
})

test('non-combat types do not offer combat overlay or 3D preview', async () => {
  gens = [{ ...gen, id: 41, status: 'done', prompt: 'p', image_path: 'x' }]
  server.use(http.get('/api/card-types', () => HttpResponse.json([{ ...cardTypes[0], name: 'events' }])))
  renderAt()
  await userEvent.click(await screen.findByRole('button', { name: 'Open Sisters × events #41' }))
  expect(screen.queryByRole('tab', { name: 'Card preview' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Card preview' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /3D preview/ })).not.toBeInTheDocument()
})
