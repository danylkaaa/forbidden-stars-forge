import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import { useAssembly } from '../pages/assemble/state'
import { FactionTree } from './FactionTree'

const faction = (id: number, name: string, dlc: string) => ({ id, name, dlc, primary_color: '', texture: '', description: '', created_at: '', updated_at: '' })
const card = (id: number, faction_id: number) => ({ id, faction_id, category: 'combat', name: `c${id}` })

function Where() { return <span data-testid="where">{useLocation().pathname}</span> }

beforeEach(() => {
  useAssembly.setState({ factionId: null })
  server.use(
    http.get('/api/factions', () => HttpResponse.json([faction(1, 'Tau Empire', 'Galaxy in Flames'), faction(2, 'Sisters of battle', 'Symphony of War'), faction(3, 'Adeptus Mechanicus', 'Symphony of War')])),
    http.get('/api/cards', () => HttpResponse.json([card(1, 2), card(2, 2), card(3, 3)])),
    http.get('/api/faction-logos', () => HttpResponse.json([{ faction_id: 2, url: '/logo-2.png' }])),
    http.get('/api/faction-colors', () => HttpResponse.json([{ faction_id: 3, color: '#a0522d' }])),
  )
})

function renderAt(path: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><FactionTree /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter>
  </QueryClientProvider>)
}

test('factions are grouped by expansion with their card counts; the chosen one is marked and its group is open', async () => {
  renderAt('/assemble')
  // The first faction is chosen when none is: Tau Empire in Galaxy in Flames.
  const tau = await screen.findByRole('button', { name: /Tau Empire/ })
  expect(tau).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: /Galaxy in Flames/ })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /Symphony of War/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: /Sisters of battle/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Symphony of War/ }))
  const sisters = await screen.findByRole('button', { name: /Sisters of battle/ })
  expect(within(sisters).getByText('2')).toBeInTheDocument()
  expect(sisters.querySelector('img')).toHaveAttribute('src', '/logo-2.png') // the logo in the circle
  expect(within(screen.getByRole('button', { name: /Adeptus Mechanicus/ })).getByText('1')).toBeInTheDocument()
})

test('choosing a faction selects it, and leads back to the library from another page', async () => {
  renderAt('/factions')
  await userEvent.click(await screen.findByRole('button', { name: /Symphony of War/ }))
  await userEvent.click(await screen.findByRole('button', { name: /Adeptus Mechanicus/ }))
  expect(useAssembly.getState().factionId).toBe(3)
  expect(screen.getByTestId('where')).toHaveTextContent('/assemble')
  expect(screen.getByRole('button', { name: /Adeptus Mechanicus/ })).toHaveAttribute('aria-current', 'true')
})
