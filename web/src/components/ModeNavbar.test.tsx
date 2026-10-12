import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AppLayout } from './AppLayout'

function mount(path: string) {
  const router = createMemoryRouter([{ element: <AppLayout />, children: ['factions', 'card-types', 'cards', 'assemble', 'faction-lab', 'generations', 'batches/:id', 'settings', 'subtypes'].map(path => ({ path: `/${path}`, element: <p>Page content</p> })) }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}
const sections = () => within(screen.getByRole('navigation', { name: 'Sections' }))
const modes = () => within(screen.getByRole('navigation', { name: 'Workspace mode' }))

test('top navbar switches between generation and library sections', async () => {
  mount('/faction-lab')
  expect(modes().getByRole('link', { name: 'AI Image Generation' })).toHaveAttribute('aria-current', 'page')
  expect(sections().getByRole('link', { name: 'Batch Processing' })).toBeInTheDocument()
  expect(sections().queryByRole('link', { name: 'Cards' })).not.toBeInTheDocument()
  expect(sections().queryByRole('link', { name: 'Test Generation' })).not.toBeInTheDocument()
  await userEvent.click(modes().getByRole('link', { name: 'Library' }))
  expect(modes().getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
  expect(sections().getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
  expect(sections().queryByRole('link', { name: 'Cards' })).not.toBeInTheDocument()
  expect(sections().queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  await userEvent.click(modes().getByRole('link', { name: 'AI Image Generation' }))
  expect(sections().getByRole('link', { name: 'Faction Lab' })).toHaveAttribute('aria-current', 'page')
})

test('shared management pages preserve library mode through navigation and Back', async () => {
  const router = mount('/assemble')
  await userEvent.click(sections().getByRole('link', { name: 'Factions' }))
  expect(router.state.location.search).toBe('?mode=library')
  expect(modes().getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
  await userEvent.click(sections().getByRole('link', { name: 'Card Types' }))
  expect(router.state.location.pathname).toBe('/subtypes')
  await userEvent.click(modes().getByRole('link', { name: 'AI Image Generation' }))
  expect(sections().getByRole('link', { name: 'Card Types' })).toHaveAttribute('href', '/card-types')
  await act(() => router.navigate(-1))
  expect(modes().getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
  expect(sections().getByRole('link', { name: 'Card Types' })).toHaveAttribute('aria-current', 'page')
})

test.each([
  ['/cards', 'Library'], ['/assemble', 'Library'], ['/factions?mode=library', 'Library'],
  ['/card-types?mode=library', 'Library'], ['/batches/42', 'AI Image Generation'], ['/settings', 'AI Image Generation'],
])('deep link %s opens the correct mode', (path, mode) => {
  mount(path)
  expect(modes().getByRole('link', { name: mode })).toHaveAttribute('aria-current', 'page')
})
