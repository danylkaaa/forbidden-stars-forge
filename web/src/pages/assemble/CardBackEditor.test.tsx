import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { CardBackEditor } from './CardBackEditor'
vi.mock('./library', () => ({
  useTemplate: () => ({ image: { url: '/back.png', logoUrl: '/logo.png', logoScale: 0.4, elementUrl: '/element.png' } }),
  usePreviewTemplate: () => ({ image: undefined }),
}))
vi.mock('./BackImage', () => ({ BackImage: ({ scale, elementUrl }: { scale?: number; elementUrl?: string }) => <div data-testid="back" data-scale={scale} data-element={elementUrl} /> }))

test('the banner size is the only back setting of a combat template, and it is saved with the layout', async () => {
  let saved: { back?: Record<string, number> } | undefined
  server.use(
    http.get('/api/card-type-layouts', () => HttpResponse.json([{ category: 'combat', layout: {} }])),
    http.get('/api/factions', () => HttpResponse.json([{ id: 1, name: 'Tau' }])),
    http.get('/api/reference-cards', () => HttpResponse.json([])),
    http.put('/api/card-type-layouts/combat', async ({ request }) => { saved = ((await request.json()) as { layout: typeof saved }).layout; return HttpResponse.json({ category: 'combat', layout: saved }) }))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CardBackEditor category="combat" /></QueryClientProvider>)
  const slider = await screen.findByLabelText(/Banner size/)
  expect(screen.queryByLabelText(/Maximum logo size/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/Element across/)).not.toBeInTheDocument()
  // The preview shows the faction's banner: its logo size and its element.
  expect((await screen.findByTestId('back')).dataset).toMatchObject({ scale: '0.4', element: '/element.png' })
  fireEvent.change(slider, { target: { value: '80' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save back' }))
  await waitFor(() => expect(saved?.back).toEqual({ overlay_scale: 0.8 }))
})
