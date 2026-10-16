import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { ElementPicker } from './ElementPicker'

const gen = (id: number, faction: number, type: number, name: string, favorite = false) => ({
  id, faction_id: faction, card_type_id: type, mode: 'draft', model: '', quality: 'low', name, favorite, parent_kind: '', parent_id: 0, parent_name: '', edit_instruction: '', prompt: 'p',
  status: 'done', image_path: 'x', input_tokens: 0, output_tokens: 0, cost_usd: 0, duration_ms: 0, error: '', created_at: `2026-01-0${id} 00:00:00`,
})
const types = [{ id: 1, name: 'combat' }, { id: 2, name: 'back element' }].map(t => ({ ...t, description: '', constraints: '', template_path: '', openai_file_id: '', overlay_path: '', created_at: 'a', updated_at: 'b' }))
const factions = [{ id: 1, name: 'Tau' }, { id: 2, name: 'Orks' }]

function open(onSelect = vi.fn()) {
  server.use(
    http.get('/api/generations', () => HttpResponse.json([gen(1, 1, 2, '1-tau-element'), gen(2, 1, 1, '2-tau-combat'), gen(3, 2, 2, '3-orks-element', true)])),
    http.get('/api/card-types', () => HttpResponse.json(types)),
    http.get('/api/factions', () => HttpResponse.json(factions)),
  )
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ElementPicker title="Choose banner element" factionId={1} elementTypeName="back element" selectedKey="" aspect="816 / 300" onSelect={onSelect} onClose={() => {}} />
  </QueryClientProvider>)
  return onSelect
}

test('starts on this faction\'s element images; the filters reach any image of any faction or type', async () => {
  const onSelect = open()
  const dialog = await screen.findByRole('dialog', { name: 'Choose banner element' })
  expect(await within(dialog).findByRole('button', { name: 'Use 1-tau-element as element' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Use 2-tau-combat as element' })).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Use 3-orks-element as element' })).not.toBeInTheDocument()
  await userEvent.selectOptions(within(dialog).getByLabelText('Image type'), 'all')
  expect(within(dialog).getByRole('button', { name: 'Use 2-tau-combat as element' })).toBeInTheDocument()
  await userEvent.selectOptions(within(dialog).getByLabelText('Faction'), 'all')
  expect(within(dialog).getByRole('button', { name: 'Use 3-orks-element as element' })).toBeInTheDocument()
  await userEvent.click(within(dialog).getByLabelText('Favorites'))
  expect(within(dialog).queryByRole('button', { name: 'Use 1-tau-element as element' })).not.toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Use 3-orks-element as element' }))
  expect(onSelect).toHaveBeenCalledWith('test-3')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reset filters' }))
  expect(within(dialog).getByRole('button', { name: 'Use 1-tau-element as element' })).toBeInTheDocument()
})

test('search narrows by name', async () => {
  open()
  const dialog = await screen.findByRole('dialog', { name: 'Choose banner element' })
  await within(dialog).findByRole('button', { name: 'Use 1-tau-element as element' })
  await userEvent.selectOptions(within(dialog).getByLabelText('Image type'), 'all')
  await userEvent.type(within(dialog).getByLabelText('Search images'), 'combat')
  expect(within(dialog).getAllByRole('button', { name: /as element$/ })).toHaveLength(1)
})
