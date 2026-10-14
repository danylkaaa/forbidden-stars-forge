import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { ReferenceCards } from './ReferenceCards'

test('reference cards of a type are listed, opened full size, uploaded and removed', async () => {
  let cards = [{ id: 1, category: 'combat', name: 'Sample', url: '/ref/1' }, { id: 2, category: 'upgrade', name: 'Other type', url: '/ref/2' }]
  let uploadedTo = ''
  server.use(
    http.get('/api/reference-cards', () => HttpResponse.json(cards)),
    http.post('/api/reference-cards/:category', ({ params }) => { uploadedTo = String(params.category); cards = [...cards, { id: 3, category: 'combat', name: 'New', url: '/ref/3' }]; return HttpResponse.json(cards[2], { status: 201 }) }),
    http.delete('/api/reference-cards/:id', ({ params }) => { cards = cards.filter(c => c.id !== Number(params.id)); return new HttpResponse(null, { status: 204 }) }))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReferenceCards category="combat" /></QueryClientProvider>)
  expect(await screen.findByRole('button', { name: 'Open reference Sample' })).toBeInTheDocument()
  expect(screen.queryByText('Other type')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open reference Sample' }))
  expect(within(screen.getByRole('dialog', { name: 'Reference Sample' })).getByRole('img', { name: 'Sample' })).toHaveAttribute('src', '/ref/1')
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  await userEvent.upload(screen.getByLabelText('Upload reference card front'), new File(['x'], 'new.png', { type: 'image/png' }))
  await waitFor(() => expect(uploadedTo).toBe('combat'))
  expect(await screen.findByRole('button', { name: 'Open reference New' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Remove reference Sample' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Open reference Sample' })).not.toBeInTheDocument())
})

test('a reference is laid over the preview with its opacity, and only when switched on', async () => {
  const { ReferenceOverlay, ReferenceOverlayControls } = await import('./ReferenceOverlay')
  const { useReferenceOverlay } = await import('./referenceOverlayStore')
  useReferenceOverlay.setState({ on: false, opacity: 0.5, chosen: {} })
  server.use(http.get('/api/reference-cards', () => HttpResponse.json([
    { id: 1, category: 'combat', side: 'front', name: 'Front ref', url: '/ref/1' }, { id: 2, category: 'combat', side: 'back', name: 'Back ref', url: '/ref/2' }])))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <div className="relative"><ReferenceOverlay category="combat" side="front" /></div><ReferenceOverlayControls category="combat" side="front" /></QueryClientProvider>)
  const show = await screen.findByLabelText('Show reference')
  await waitFor(() => expect(show).toBeEnabled())
  expect(screen.queryByTestId('reference-overlay')).not.toBeInTheDocument()
  await userEvent.click(show)
  const overlay = await screen.findByTestId('reference-overlay')
  expect(overlay).toHaveAttribute('src', '/ref/1')
  expect(overlay).toHaveStyle({ opacity: '0.5' })
  fireEvent.change(screen.getByLabelText('Reference opacity'), { target: { value: '30' } })
  expect(screen.getByTestId('reference-overlay')).toHaveStyle({ opacity: '0.3' })
})
