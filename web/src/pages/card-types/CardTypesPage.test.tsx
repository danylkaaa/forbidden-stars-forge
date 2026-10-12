import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import { useCardTypesUi, useCardTypeDraft } from './store'
import type { CardType } from './api'
import CardTypesPage from './CardTypesPage'

const cardTypes: CardType[] = [
  { id: 1, name: 'combat', description: 'frontline warriors', constraints: 'fill crimson zone', template_path: 'templates/a.png', openai_file_id: 'file-8a2f91cd', overlay_path: '', created_at: 'a', updated_at: 'u1' },
  { id: 2, name: 'upgrade', description: 'insignia art', constraints: '', template_path: '', openai_file_id: '', overlay_path: '', created_at: 'a', updated_at: 'u2' },
]

// jsdom can't load images: stub Image so onFileSelect gets fixed dimensions.
class FakeImage {
  onload: null | (() => void) = null
  naturalWidth = 830
  naturalHeight = 1080
  set src(_v: string) {
    queueMicrotask(() => this.onload?.())
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CardTypesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage)
  // Subclass keeps `new URL(...)` working (msw's interceptor needs it) while
  // stubbing the statics — and unstubbing restores the untouched real URL.
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = () => 'blob:fake'
    static revokeObjectURL = () => {}
  })
  useCardTypeDraft.getState().close()
  useCardTypesUi.setState({ dialogMode: null, editingId: null, stagedFile: null, stagedMeta: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, assistField: null })
  server.use(http.get('/api/card-types', () => HttpResponse.json(cardTypes)))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders grid with file-id tag and not-uploaded state', async () => {
  renderPage()
  expect(await screen.findByText('combat')).toBeInTheDocument()
  expect(screen.getByText('file-8a2f91cd')).toBeInTheDocument()
  expect(screen.getByText('not uploaded')).toBeInTheDocument()
})

test('create flow posts multipart with staged file', async () => {
  let gotName: unknown, gotFile: File | null = null
  server.use(
    http.post('/api/card-types', async ({ request }) => {
      const form = await request.formData()
      gotName = form.get('name')
      gotFile = form.get('template') as File | null
      return HttpResponse.json({ id: 3, name: gotName, description: '', constraints: '', template_path: 'templates/x.png', openai_file_id: '', overlay_path: '', created_at: 'a', updated_at: 'u' }, { status: 201 })
    }),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /New Card Type/ }))
  const dialog = screen.getByRole('dialog', { name: 'New Card Type' })
  await userEvent.type(within(dialog).getByLabelText('Name'), 'schema')
  await userEvent.type(within(dialog).getByLabelText('Constraints'), 'blue grid')
  const file = new File(['png'], 'schema.png', { type: 'image/png' })
  await userEvent.upload(within(dialog).getByLabelText(/Template image/), file)
  expect(await within(dialog).findByText(/deviates from 816:1104/)).toBeInTheDocument() // FakeImage is 830x1080
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save Card Type' }))
  await screen.findByText('combat') // dialog closed
  expect(gotName).toBe('schema')
  // NOTE: vitest's jsdom environment drops the File.name when a FormData
  // body with a File is converted for the intercepted Request (open bug:
  // vitest-dev/vitest#9260, still unresolved on vitest 4.1.10) — the field
  // does arrive as a File with the right mime type, just renamed to "blob"
  // by the test harness. Real browsers do not have this bug.
  // Cast defeats tsc's stale narrowing: it keeps `gotFile` at null because
  // it can't see the MSW-callback assignment happening before this line.
  const uploaded = gotFile as File | null
  expect(uploaded).not.toBeNull()
  expect(uploaded?.type).toBe('image/png')
})

test('staged file makes form dirty; discard clears it', async () => {
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Card Type' })
  expect(within(dialog).queryByText('Unsaved changes')).not.toBeInTheDocument()
  const file = new File(['png'], 'new.png', { type: 'image/png' })
  await userEvent.upload(within(dialog).getByLabelText(/Template image/), file)
  expect(await within(dialog).findByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
  expect(within(dialog).queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('upload-to-openai disabled while template staged; works in clean edit mode', async () => {
  let uploaded = false
  server.use(http.post('/api/card-types/1/upload-to-openai', () => { uploaded = true; return HttpResponse.json({ openai_file_id: 'file-new' }) }))
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Card Type' })
  const uploadBtn = within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ })
  expect(uploadBtn).toBeEnabled()
  const file = new File(['png'], 'new.png', { type: 'image/png' })
  await userEvent.upload(within(dialog).getByLabelText(/Template image/), file)
  expect(within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ })).toBeDisabled()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
  await userEvent.click(within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ }))
  expect(uploaded).toBe(true)
})

test('upload-to-openai failure shows alert', async () => {
  server.use(http.post('/api/card-types/1/upload-to-openai', () => HttpResponse.json({ error: 'openai: invalid file (request id req_1)' }, { status: 502 })))
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Card Type' })
  await userEvent.click(within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/invalid file/)
})

test('delete failure shows alert in confirm dialog', async () => {
  server.use(http.delete('/api/card-types/2', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderPage()
  await screen.findByText('upgrade')
  await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
  await userEvent.click(screen.getByRole('button', { name: 'Delete card type' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('boom')
})

test('undecodable file shows error, revokes blob url, stages nothing', async () => {
  const revoke = vi.fn()
  class FailImage {
    onload: null | (() => void) = null
    onerror: null | (() => void) = null
    set src(_v: string) {
      queueMicrotask(() => this.onerror?.())
    }
  }
  vi.stubGlobal('Image', FailImage)
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = () => 'blob:bad'
    static revokeObjectURL = revoke
  })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /New Card Type/ }))
  const dialog = screen.getByRole('dialog', { name: 'New Card Type' })
  const file = new File(['junk'], 'broken.png', { type: 'image/png' })
  await userEvent.upload(within(dialog).getByLabelText(/Template image/), file)
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/could not be read as an image/)
  expect(revoke).toHaveBeenCalledWith('blob:bad')
  expect(useCardTypesUi.getState().stagedFile).toBeNull()
})

test('edit constraints with Claude: sends draft fields + conversation, accept updates the draft', async () => {
  let body: Record<string, unknown> | null = null
  server.use(
    http.post('/api/card-types/assist', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ job_id: 'job-ct', status: 'pending' }, { status: 202 })
    }),
    http.get('/api/jobs/job-ct', () =>
      HttpResponse.json({ id: 'job-ct', status: 'done', result: 'fill crimson zone; keep banner', duration_ms: 5 })),
  )
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  await userEvent.click(screen.getByRole('button', { name: 'Edit constraints with Claude' }))
  const panel = screen.getByRole('region', { name: 'Claude assistant: constraints' })
  await userEvent.type(within(panel).getByRole('textbox'), 'keep the banner')
  await userEvent.click(within(panel).getByRole('button', { name: 'Send to Claude' }))
  await userEvent.click(await within(panel).findByRole('button', { name: 'Accept' }, { timeout: 4000 }))

  expect(body).toEqual({
    field: 'constraints', name: 'combat', description: 'frontline warriors', constraints: 'fill crimson zone',
    messages: [{ role: 'user', content: 'keep the banner' }],
  })
  expect(useCardTypeDraft.getState().draft?.constraints).toBe('fill crimson zone; keep banner')
  expect(screen.queryByRole('region', { name: /Claude assistant/ })).not.toBeInTheDocument()
})

test('overlay upload saves immediately via its own endpoint', async () => {
  let uploaded: string | null = null
  server.use(
    // jsdom mangles File parts in intercepted FormData (see the create-flow
    // test), so only assert the endpoint is hit.
    http.put('/api/card-types/1/overlay', () => {
      uploaded = 'yes'
      return HttpResponse.json({ ...cardTypes[0], overlay_path: 'overlays/o.png' })
    }),
  )
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Card Type' })
  expect(within(dialog).getByText(/Never sent to OpenAI/)).toBeInTheDocument()
  await userEvent.upload(within(dialog).getByLabelText('Overlay file'), new File(['png'], 'o.png', { type: 'image/png' }))
  await waitFor(() => expect(uploaded).toBe('yes'))
})

test('card type name links to its generations', async () => {
  renderPage()
  expect(await screen.findByRole('link', { name: 'combat' })).toHaveAttribute('href', '/generations?card_type=1')
})
