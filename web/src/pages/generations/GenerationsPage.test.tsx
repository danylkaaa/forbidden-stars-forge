import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { server } from '../../test/msw'
import GenerationsPage from './GenerationsPage'

const factions = [
  { id: 1, name: 'Tau Empire', description: '', dlc: 'Galaxy in Flames', created_at: 'a', updated_at: 'b' },
  { id: 2, name: 'Sisters', description: '', dlc: 'Symphony of War', created_at: 'a', updated_at: 'b' },
]
const cardTypes = [
  { id: 1, name: 'combat', description: '', constraints: '', template_path: '', openai_file_id: 'f', overlay_path: '', created_at: 'a', updated_at: 'b' },
  { id: 2, name: 'upgrade', description: '', constraints: '', template_path: '', openai_file_id: 'f', overlay_path: '', created_at: 'a', updated_at: 'b' },
]
const gen = (id: number, faction_id: number, card_type_id: number, status = 'done') => ({
  id, faction_id, card_type_id, mode: 'draft', model: 'gpt-image-2', prompt: 'p', status, image_path: 'x',
  quality: 'low', name: `${id}-f${faction_id}-ct${card_type_id}-low`, favorite: id === 2,
  input_tokens: 0, output_tokens: 0, cost_usd: 0.1, duration_ms: 1, error: '', created_at: `2026-10-0${id} 10:00:00`,
})
const batchItem = {
  id: 7, batch_id: 3, faction_id: 2, card_type_id: 2, custom_id: 'sisters__upgrade', status: 'done', image_path: 'y',
  quality: 'high', name: '1-sisters-upgrade-high', favorite: false,
  input_tokens: 0, output_tokens: 0, cost_usd: 0.05, error: '', mode: 'final', model: 'gpt-image-2.5-flare', completed_at: '2026-10-09 10:00:00',
}

function Search() {
  return <span data-testid="search">{useLocation().search}</span>
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/generations" element={<><GenerationsPage /><Search /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
    http.get('/api/generations', () => HttpResponse.json([gen(1, 1, 1), gen(2, 2, 1), gen(4, 1, 2, 'pending')])),
    http.get('/api/batch-items', () => HttpResponse.json([batchItem])),
  )
})

const cards = () => screen.getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'))

test('shows finished test generations and batch items, newest first', async () => {
  renderAt('/generations')
  await screen.findByText('3 images')
  expect(cards()).toEqual(['Open Sisters × upgrade', 'Open Sisters × combat', 'Open Tau Empire × combat'])
  expect(screen.getByRole('link', { name: 'batch #3' })).toHaveAttribute('href', '/batches/3')
})

test('filters are prefilled from the URL', async () => {
  renderAt('/generations?faction=1')
  await screen.findByText('1 of 3 images')
  expect(cards()).toEqual(['Open Tau Empire × combat'])
  expect(screen.getByRole('button', { name: 'Faction: Tau Empire' })).toBeInTheDocument()
})

test('changing filters updates the URL; clear resets', async () => {
  renderAt('/generations?card_type=1')
  await screen.findByText('2 of 3 images')
  await userEvent.click(screen.getByRole('button', { name: 'Source: All' }))
  await userEvent.click(within(screen.getByRole('group', { name: 'Source' })).getByLabelText('Batch'))
  expect(screen.getByTestId('search')).toHaveTextContent('?card_type=1&source=batch')
  expect(screen.getByText('No generations match the filters.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByTestId('search')).toBeEmptyDOMElement()
  expect(cards()).toHaveLength(3)
})

test('search matches image names; favorites filter; both live in the URL', async () => {
  renderAt('/generations')
  await screen.findByText('3 images')
  await userEvent.type(screen.getByLabelText('Search by name'), 'sisters high')
  expect(cards()).toEqual(['Open Sisters × upgrade'])
  expect(screen.getByText('1-sisters-upgrade-high')).toBeInTheDocument()
  expect(screen.getByTestId('search')).toHaveTextContent('q=sisters+high')

  await userEvent.clear(screen.getByLabelText('Search by name'))
  await userEvent.click(screen.getByRole('button', { name: /Favorites/ }))
  expect(cards()).toEqual(['Open Sisters × combat'])
  expect(screen.getByTestId('search')).toHaveTextContent('fav=1')
})

test('star toggles favorite through the right endpoint', async () => {
  let put: unknown = null
  let fav = false
  server.use(
    http.put('/api/batches/3/items/7/favorite', async ({ request }) => {
      put = await request.json()
      fav = true
      return HttpResponse.json({ favorite: true })
    }),
    http.get('/api/batch-items', () => HttpResponse.json([{ ...batchItem, favorite: fav }])),
  )
  renderAt('/generations?source=batch')
  await screen.findByText('1 of 3 images')
  await userEvent.click(screen.getByRole('button', { name: 'Add to favorites' }))
  await waitFor(() => expect(put).toEqual({ favorite: true }))
  expect(await screen.findByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument()
})

test('image popup has a favorite button', async () => {
  let put: unknown = null
  let fav = false
  server.use(
    http.put('/api/batches/3/items/7/favorite', async ({ request }) => {
      put = await request.json()
      fav = true
      return HttpResponse.json({ favorite: true })
    }),
    http.get('/api/batch-items', () => HttpResponse.json([{ ...batchItem, favorite: fav }])),
  )
  renderAt('/generations?source=batch')
  await userEvent.click(await screen.findByRole('button', { name: 'Open Sisters × upgrade' }))
  const dialog = screen.getByRole('dialog', { name: 'Sisters × upgrade' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add to favorites' }))
  await waitFor(() => expect(put).toEqual({ favorite: true }))
  expect(await within(dialog).findByRole('button', { name: 'Remove from favorites' })).toHaveTextContent('★ Favorite')
  expect(screen.getByRole('dialog')).toBeInTheDocument() // starring doesn't close the popup
})
