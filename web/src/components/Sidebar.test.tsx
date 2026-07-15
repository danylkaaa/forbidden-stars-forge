import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import { routes } from '../App'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

test('sidebar renders all five section links', () => {
  // /settings now renders SettingsPage (Task 9), which fetches settings via react-query.
  server.use(
    http.get('/api/settings', () =>
      HttpResponse.json({
        openai_api_key_masked: '',
        openai_api_key_from_env: false,
        openai_model: '',
        image_size: '',
        draft_quality: 'low',
        final_quality: 'high',
        input_fidelity: 'high',
        claude_binary: '',
        price_table: '{}',
      }),
    ),
  )
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
