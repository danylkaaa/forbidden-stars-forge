import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { ArtworkExtend } from './ArtworkExtend'

function renderIt(onDone = vi.fn(), disabled = false) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ArtworkExtend cardId="7" ratio={0.683} disabled={disabled} onDone={onDone} />
  </QueryClientProvider>)
  return onDone
}

test('asks the AI to extend the artwork to the artwork area\'s shape and hands back the new assembly', async () => {
  let body: Record<string, unknown> | null = null
  server.use(http.post('/api/cards/7/artwork/extend', async ({ request }) => {
    body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ image_key: 'upload', image_url: '/api/cards/7/artwork?v=new.png', overlay_id: 'auto', transform: { scale: 1, x: 0, y: 0 }, layout: {}, cost_usd: 0.1536 })
  }))
  const onDone = renderIt()
  await userEvent.click(screen.getByRole('button', { name: 'Extend with AI' }))
  expect(screen.getByText(/0\.68:1/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('What to paint around the artwork'), 'smoke')
  await userEvent.click(screen.getByRole('button', { name: 'Extend artwork' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(body).toEqual({ ratio: 0.683, prompt: 'smoke' })
  expect(onDone.mock.calls[0][0]).toMatchObject({ image_url: '/api/cards/7/artwork?v=new.png' })
  expect(await screen.findByRole('status')).toHaveTextContent('$0.15')
})

test('a failure is shown and nothing is replaced; the button is off when it cannot run', async () => {
  server.use(http.post('/api/cards/7/artwork/extend', () => HttpResponse.json({ error: 'openai: bad request' }, { status: 502 })))
  const onDone = renderIt()
  await userEvent.click(screen.getByRole('button', { name: 'Extend with AI' }))
  await userEvent.click(screen.getByRole('button', { name: 'Extend artwork' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('openai: bad request')
  expect(onDone).not.toHaveBeenCalled()
})

test('is off while the card is not saved or busy', () => {
  renderIt(vi.fn(), true)
  expect(screen.getByRole('button', { name: 'Extend with AI' })).toBeDisabled()
})
