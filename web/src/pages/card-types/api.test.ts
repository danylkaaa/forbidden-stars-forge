import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { buildCardTypeForm, createCardType, deleteCardType, uploadToOpenAI, templateUrl } from './api'
import type { CardType } from './api'

test('buildCardTypeForm includes fields and optional template', () => {
  const file = new File(['png'], 'combat.png', { type: 'image/png' })
  const form = buildCardTypeForm({ name: 'combat', description: 'd', constraints: 'c' }, file)
  expect(form.get('name')).toBe('combat')
  expect(form.get('description')).toBe('d')
  expect(form.get('constraints')).toBe('c')
  expect((form.get('template') as File).name).toBe('combat.png')

  const noFile = buildCardTypeForm({ name: 'x', description: '', constraints: '' }, null)
  expect(noFile.get('template')).toBeNull()
})

test('createCardType posts multipart and parses response', async () => {
  server.use(
    http.post('/api/card-types', async ({ request }) => {
      const form = await request.formData()
      return HttpResponse.json(
        { id: 1, name: form.get('name'), description: '', constraints: '', template_path: '', openai_file_id: '', overlay_path: '', created_at: 'a', updated_at: 'b' },
        { status: 201 },
      )
    }),
  )
  const ct = await createCardType(buildCardTypeForm({ name: 'combat', description: '', constraints: '' }, null))
  expect(ct.id).toBe(1)
  expect(ct.name).toBe('combat')
})

test('deleteCardType resolves on 204', async () => {
  server.use(http.delete('/api/card-types/3', () => new HttpResponse(null, { status: 204 })))
  await expect(deleteCardType(3)).resolves.toBeUndefined()
})

test('uploadToOpenAI returns file id; error surfaces message', async () => {
  server.use(http.post('/api/card-types/1/upload-to-openai', () => HttpResponse.json({ openai_file_id: 'file-x' })))
  await expect(uploadToOpenAI(1)).resolves.toEqual({ openai_file_id: 'file-x' })

  server.use(http.post('/api/card-types/2/upload-to-openai', () => HttpResponse.json({ error: 'openai: invalid file (request id req_1)' }, { status: 502 })))
  await expect(uploadToOpenAI(2)).rejects.toThrow(/invalid file/)
})

test('templateUrl builds cache-busted url or null', () => {
  const base: CardType = { id: 5, name: 'x', description: '', constraints: '', template_path: 'templates/a.png', openai_file_id: '', overlay_path: '', created_at: 'a', updated_at: '2026-07-17 10:00:00' }
  expect(templateUrl(base)).toBe('/api/card-types/5/template?v=2026-07-17%2010%3A00%3A00')
  expect(templateUrl({ ...base, template_path: '' })).toBeNull()
})

test('buildCardTypeForm sends the image size only when it is set', () => {
  expect(buildCardTypeForm({ name: 'x', description: '', constraints: '', image_size: '816x1104' }, null).get('image_size')).toBe('816x1104')
  expect(buildCardTypeForm({ name: 'x', description: '', constraints: '' }, null).has('image_size')).toBe(false)
})
