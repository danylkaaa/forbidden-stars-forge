import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import { useFactionLab } from './store'
import { usePreviewLayers } from '../../lib/previewLayers'
import FactionLabPage from './FactionLabPage'

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
  usePreviewLayers.setState({ overlay: true, mask: false, maskOpacity: 0.5 })
  useFactionLab.setState({ factionId: null, cardTypeId: 1, mode: 'draft', model: '', drafts: {}, snapshots: {}, ctDrafts: {}, ctSnapshots: {} })
  server.use(
    http.get('/api/factions', () => HttpResponse.json([faction])),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
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
      gens = [g]
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

test('result preview has inline overlay and mask controls', async () => {
  gens = [{ ...gen, id: 41, status: 'done', prompt: 'p', image_path: 'x' }]
  renderAt()
  await screen.findByRole('button', { name: 'Open Sisters × combat #41' })
  expect(screen.getByTestId('overlay')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Overlay on' }))
  expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
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
