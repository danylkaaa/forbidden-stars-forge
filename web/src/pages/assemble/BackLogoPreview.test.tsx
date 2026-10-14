import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { BackFlatPreview } from './BackLogoPreview'
import { GenerationPreview3D } from './GenerationPreview3D'
vi.mock('./library', () => ({
  useTemplate: () => ({ image: { url: '/front.png', logoUrl: '/wrong.png', logoScale: .9 } }),
  useLibraryImages: () => ({ data: [{ key: 'test-7', url: '/element.png' }] }),
}))
vi.mock('./previewCard', () => ({ usePreviewCard: () => ({ card: { id: 0 }, combat: [] }), useAssembledPreview: () => ({ result: { canvas: { toDataURL: () => '/front.png' } }, rendering: false }) }))
vi.mock('./BackImage', () => ({ BackImage: (p: { category?: string; factionId?: number; url: string; logoUrl?: string; scale?: number; elementUrl?: string }) => <div data-testid="back" data-category={p.category} data-faction={p.factionId} data-url={p.url} data-logo={p.logoUrl} data-scale={p.scale} data-element={p.elementUrl} /> }))
beforeEach(() => {
  server.use(
    http.get('/api/faction-logos', () => HttpResponse.json([{ faction_id: 1, url: '/logo.png' }])),
    http.get('/api/faction-banners', () => HttpResponse.json([{ faction_id: 1, logo_scale: 0.35, element_key: 'test-7', element_x: 0, element_y: 0, element_scale: 0.42 }])))
})
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>)
}
test('a generated back is previewed with the faction banner: its logo size and element', async () => {
  wrap(<BackFlatPreview factionId={1} src="/candidate.png" alt="Back" />)
  const back = await screen.findByTestId('back')
  await vi.waitFor(() => expect(back.dataset).toMatchObject({ category: 'combat', faction: '1', url: '/candidate.png', logo: '/logo.png', scale: '0.35', element: '/element.png' }))
})
test('the 3D preview of a back draws it as a combat back with the faction banner', async () => {
  wrap(<GenerationPreview3D factionId={1} imageUrl="/candidate.png" side="back" title="Candidate" />)
  fireEvent.click(screen.getByRole('button', { name: '3D preview of Candidate' }))
  const back = await screen.findByTestId('back')
  await vi.waitFor(() => expect(back.dataset).toMatchObject({ category: 'combat', url: '/candidate.png', logo: '/logo.png', scale: '0.35', element: '/element.png' }))
  expect(screen.queryByRole('slider', { name: 'Back logo size' })).not.toBeInTheDocument()
})
