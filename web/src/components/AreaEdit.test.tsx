import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import { HideAreasButton, ZoomableImage } from './ImageLightbox'

// jsdom has no canvas: record drawing calls and fake the PNG export.
const ops: string[] = []
beforeEach(() => {
  ops.length = 0
  const ctx = new Proxy({}, {
    get: (_t, prop) => (typeof prop === 'string' && /^[a-z]/.test(prop) ? (..._a: unknown[]) => { ops.push(prop) } : undefined),
    set: () => true,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,TUFTSw==')
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, width: 408, height: 552, right: 408, bottom: 552, x: 0, y: 0, toJSON: () => ({}) })
})
afterEach(() => vi.restoreAllMocks())

function renderPopup(onEdited = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ZoomableImage src="/api/generations/9/image" alt="Card" editTarget={{ kind: 'generation', id: 9 }}
        compareSrc="/api/generations/4/image" onEdited={onEdited}>
        <img src="/x.png" alt="thumb" />
      </ZoomableImage>
    </QueryClientProvider>,
  )
  return onEdited
}

async function openEditor() {
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  await userEvent.click(screen.getByRole('button', { name: '✎ Edit area' }))
  const img = screen.getByRole('dialog').querySelector('img[alt="Card"]') as HTMLImageElement
  Object.defineProperty(img, 'naturalWidth', { value: 816 })
  Object.defineProperty(img, 'naturalHeight', { value: 1104 })
  fireEvent.load(img)
  return screen.getByTestId('mask-canvas')
}

test('paint + instruction sends the mask and opens nothing else; result is reported', async () => {
  let body: Record<string, unknown> | null = null
  server.use(
    http.post('/api/image-edits', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ id: 10, name: '2-tau-combat-low', status: 'pending' }, { status: 201 })
    }),
    http.get('/api/generations', () => HttpResponse.json([])),
  )
  const onEdited = renderPopup()
  const canvas = await openEditor()
  expect(canvas).toHaveAttribute('width', '816')

  const send = screen.getByRole('button', { name: 'Send edit' })
  expect(send).toBeDisabled() // nothing painted, no instruction
  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 150, clientY: 120, pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  expect(ops).toContain('lineTo')
  await userEvent.type(screen.getByLabelText('Edit instruction'), 'replace skull with cog')
  await userEvent.click(send)

  await waitFor(() => expect(body).toEqual({
    parent: { kind: 'generation', id: 9 }, mask: 'data:image/png;base64,TUFTSw==',
    instruction: 'replace skull with cog', protect: true,
  }))
  expect(ops).toContain('fillRect') // mask: opaque base, painted area cut out
  expect(await screen.findByRole('status')).toHaveTextContent('Edit started: 2-tau-combat-low')
  expect(onEdited).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }))
  expect(screen.queryByTestId('mask-canvas')).not.toBeInTheDocument()
})

test('undo/clear, protect toggle, Escape leaves edit mode before closing', async () => {
  renderPopup()
  const canvas = await openEditor()
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await userEvent.click(screen.getByLabelText('Keep unpainted area exactly as is'))
  expect(screen.getByLabelText('Keep unpainted area exactly as is')).not.toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await userEvent.keyboard('{Escape}')
  expect(screen.queryByTestId('mask-canvas')).not.toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('Original toggle shows the image it was edited from', async () => {
  renderPopup()
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  const shown = () => (screen.getByRole('dialog').querySelector('img[alt="Card"]') as HTMLImageElement).getAttribute('src')
  expect(shown()).toBe('/api/generations/9/image')
  await userEvent.click(screen.getByRole('button', { name: 'Original' }))
  expect(shown()).toBe('/api/generations/4/image')
})

test('with nothing painted an instruction changes the whole image: no mask is sent', async () => {
  let body: Record<string, unknown> | null = null
  server.use(
    http.post('/api/image-edits', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ id: 11, name: '3-tau-combat-low', status: 'pending' }, { status: 201 })
    }),
    http.get('/api/generations', () => HttpResponse.json([])),
  )
  renderPopup()
  await openEditor()
  expect(screen.getByLabelText('Keep unpainted area exactly as is')).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Edit instruction'), 'make it darker')
  await userEvent.click(screen.getByRole('button', { name: 'Send edit' }))
  await waitFor(() => expect(body).toEqual({ parent: { kind: 'generation', id: 9 }, instruction: 'make it darker', protect: false }))
})

test('reference layers can be shown over the image while painting, without changing the edit', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ZoomableImage src="/api/generations/9/image" alt="Card" maskSrc="/template.png" editTarget={{ kind: 'generation', id: 9 }}>
        <img src="/x.png" alt="thumb" />
      </ZoomableImage>
    </QueryClientProvider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  await userEvent.click(screen.getByRole('button', { name: '✎ Edit area' }))
  expect(screen.queryByTestId('edit-guide')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Card overlay' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Template guide' }))
  expect(screen.getByTestId('edit-guide')).toHaveAttribute('src', '/template.png')
  fireEvent.change(screen.getByLabelText('Template guide opacity'), { target: { value: '0.8' } })
  expect(screen.getByTestId('edit-guide')).toHaveStyle({ opacity: '0.8' })
  await userEvent.click(screen.getByRole('button', { name: 'Template guide' }))
  expect(screen.queryByTestId('edit-guide')).not.toBeInTheDocument()
})

test('hide areas: paint a mask over the image and save it apart from the image', async () => {
  let saved: { type: string | null; size: number } | null = null
  server.use(http.put('/api/generations/9/mask', async ({ request }) => { saved = { type: request.headers.get('content-type'), size: (await request.arrayBuffer()).byteLength }; return HttpResponse.json({ generation_id: 9 }) }))
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob(['png-bytes'], { type: 'image/png' })))
  renderPopup()
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  await userEvent.click(screen.getByRole('button', { name: /Hide areas/ }))
  const img = screen.getByRole('dialog').querySelector('img[alt="Card"]') as HTMLImageElement
  Object.defineProperty(img, 'naturalWidth', { value: 816 })
  Object.defineProperty(img, 'naturalHeight', { value: 1104 })
  fireEvent.load(img)
  const canvas = screen.getByTestId('hide-canvas')
  const save = screen.getByRole('button', { name: 'Save mask' })
  expect(save).toBeEnabled() // nothing hidden yet: saving just leaves the image whole
  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200, pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  await userEvent.click(screen.getByRole('button', { name: 'Result' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save mask' }))
  await waitFor(() => expect(saved).not.toBeNull())
  expect(saved).toEqual({ type: 'image/png', size: 9 })
  expect(await screen.findByRole('status')).toHaveTextContent(/Mask saved/)
})

test('the lab toolbar button opens the image straight in hide-areas mode', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><HideAreasButton src="/api/generations/9/image" alt="Card" target={{ kind: 'generation', id: 9 }} /></QueryClientProvider>)
  await userEvent.click(screen.getByRole('button', { name: 'Hide areas' }))
  expect(await screen.findByRole('button', { name: 'Save mask' })).toBeInTheDocument()
})
