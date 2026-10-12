import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { BackLogoFlatPreview } from './BackLogoPreview'
import { GenerationPreview3D } from './GenerationPreview3D'
import type { AssemblyTemplate } from './api'
vi.mock('./library', () => ({ useTemplate: () => ({ image: { url: '/front.png', logoUrl: '/wrong.png', logoScale: .9 } }) }))
vi.mock('./previewCard', () => ({ usePreviewCard: () => ({ card: { id: 0 }, combat: [] }), useAssembledPreview: () => ({ result: { canvas: { toDataURL: () => '/front.png' } }, rendering: false }) }))
let template: AssemblyTemplate
let saved: unknown
beforeEach(() => {
  saved = undefined
  template = { faction_id: 1, category: 'combat', side: 'back', image_key: 'test-7', logo_url: '/logo.png', logo_scale: .35 }
  server.use(http.get('/api/assembly-templates', () => HttpResponse.json([template])), http.put('/api/assembly-templates', async ({ request }) => {
    saved = await request.json(); template = { ...template, ...saved as AssemblyTemplate }; return HttpResponse.json(template)
  }))
})
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>)
}
test('flat preview resizes and saves the back logo without replacing the assigned image', async () => {
  wrap(<BackLogoFlatPreview factionId={1} src="/candidate.png" alt="Back" />)
  const logo = await screen.findByRole('img', { name: 'Card back logo' })
  expect(logo).toHaveStyle({ width: '35%' })
  fireEvent.change(screen.getByRole('slider', { name: 'Back logo size' }), { target: { value: '65' } })
  expect(logo).toHaveStyle({ width: '65%' })
  fireEvent.click(screen.getByRole('button', { name: 'Save logo size' }))
  await waitFor(() => expect(saved).toEqual({ faction_id: 1, category: 'combat', side: 'back', image_key: 'test-7', logo_scale: .65 }))
})
test('3D back preview uses back logo settings instead of front settings and resizes live', async () => {
  wrap(<GenerationPreview3D factionId={1} imageUrl="/candidate.png" side="back" title="Candidate" />)
  fireEvent.click(screen.getByRole('button', { name: '3D preview of Candidate' }))
  const logo = await screen.findByRole('img', { name: 'Card back logo' })
  expect(logo).toHaveAttribute('src', '/logo.png')
  expect(logo).toHaveStyle({ width: '35%' })
  expect(screen.getByRole('img', { name: 'Candidate back' })).toHaveAttribute('src', '/candidate.png')
  fireEvent.change(screen.getByRole('slider', { name: 'Back logo size' }), { target: { value: '70' } })
  expect(logo).toHaveStyle({ width: '70%' })
})
