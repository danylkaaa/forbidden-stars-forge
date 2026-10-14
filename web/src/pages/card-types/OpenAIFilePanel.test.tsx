import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { OpenAIFilePanel } from './OpenAIFilePanel'
import type { CardType } from './api'

const type: CardType = { id: 3, name: 'card back', description: '', constraints: '', template_path: 'templates/x.png', openai_file_id: 'file-1', overlay_path: '', created_at: '', updated_at: '' }
const mount = (persisted: CardType) => render(<QueryClientProvider client={new QueryClient()}><OpenAIFilePanel persisted={persisted} /></QueryClientProvider>)

test('a template is removed after a confirmation, so the type is generated from its prompt alone', async () => {
  let dropped = 0
  server.use(http.delete('/api/card-types/3/template', () => { dropped++; return HttpResponse.json({ ...type, template_path: '', openai_file_id: '', no_template: true }) }))
  mount(type)
  await userEvent.click(screen.getByRole('button', { name: 'Remove template' }))
  expect(dropped).toBe(0)
  await userEvent.click(screen.getByRole('button', { name: 'Confirm: remove template' }))
  await waitFor(() => expect(dropped).toBe(1))
})

test('a type without a template says it is generated from the prompt alone', () => {
  mount({ ...type, template_path: '', openai_file_id: '', no_template: true })
  expect(screen.getByText(/generated from the prompt alone/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Upload to OpenAI' })).not.toBeInTheDocument()
})
