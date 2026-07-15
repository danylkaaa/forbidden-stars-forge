import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import { apiGet, apiSend, ApiError } from './api'

test('apiGet returns parsed JSON', async () => {
  server.use(http.get('/api/health', () => HttpResponse.json({ ok: true })))
  await expect(apiGet<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true })
})

test('apiSend sends body and parses response', async () => {
  server.use(
    http.put('/api/settings', async ({ request }) => {
      const body = (await request.json()) as { openai_model: string }
      return HttpResponse.json({ openai_model: body.openai_model })
    }),
  )
  await expect(
    apiSend('PUT', '/api/settings', { openai_model: 'x' }),
  ).resolves.toEqual({ openai_model: 'x' })
})

test('non-2xx throws ApiError with server message', async () => {
  server.use(
    http.put('/api/settings', () =>
      HttpResponse.json({ error: 'draft_quality must be low or medium' }, { status: 400 }),
    ),
  )
  const err = (await apiSend('PUT', '/api/settings', {}).catch((e) => e)) as ApiError
  expect(err).toBeInstanceOf(ApiError)
  expect(err.status).toBe(400)
  expect(err.message).toBe('draft_quality must be low or medium')
})
