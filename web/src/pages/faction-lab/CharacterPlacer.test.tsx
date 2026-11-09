import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import { CharacterPlacer } from './CharacterPlacer'
vi.mock('../faction-card/useFactionCardCanvases', () => ({
  useSavedPlateUrl: () => null,
  useFactionCardOver: () => ({ url: null, pending: false }),
}))

beforeEach(() => {
  server.use(
    http.get('/api/faction-characters', () => HttpResponse.json([{ faction_id: 1, url: '/c.png', placement: { x: 0.25, y: 0.5, scale: 0.9 } }])),
    http.put('/api/factions/1/character/placement', () => HttpResponse.json({})),
  )
})

test('scrolling over the image resizes the character', async () => {
  // arrange
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><CharacterPlacer factionId={1} imageSize="3120x1872" /></MemoryRouter></QueryClientProvider>)
  const character = await screen.findByAltText('Placed character')

  // act
  fireEvent.wheel(screen.getByRole('application'), { deltaY: -200 })

  // assert
  expect(parseFloat(character.style.height)).toBeGreaterThan(90)
})
