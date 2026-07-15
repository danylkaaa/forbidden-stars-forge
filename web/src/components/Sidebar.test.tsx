import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../App'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

test('sidebar renders all five section links', () => {
  renderAt('/settings')
  for (const label of ['Factions', 'Card Types', 'Test Generation', 'Batch Processing', 'Settings']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
})

test('active route link is marked current', () => {
  renderAt('/card-types')
  expect(screen.getByRole('link', { name: 'Card Types' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Factions' })).not.toHaveAttribute('aria-current')
})

test('root redirects to factions', () => {
  renderAt('/')
  expect(screen.getByRole('link', { name: 'Factions' })).toHaveAttribute('aria-current', 'page')
})
