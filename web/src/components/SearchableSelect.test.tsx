import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchableSelect } from './SearchableSelect'
import { MultiSelect } from './MultiSelect'

function Example() {
  const [value, setValue] = useState('tau')
  return <><SearchableSelect aria-label="Faction" value={value} onChange={(e) => setValue(e.target.value)}>
    <option value="tau">Tau Empire</option><option value="sisters">Sisters of battle</option><option value="necrons" disabled>Necrons</option>
  </SearchableSelect><output aria-label="Selected faction">{value}</output></>
}

test('search filters by name and picking a result updates the original select', async () => {
  render(<Example />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Faction' }))
  const search = screen.getByRole('searchbox', { name: 'Search Faction' })
  expect(search).toHaveFocus()
  await userEvent.type(search, '  BATTLE  ')
  const list = screen.getByRole('listbox', { name: 'Faction options' })
  expect(within(list).getAllByRole('option')).toHaveLength(1)
  await userEvent.click(within(list).getByRole('option', { name: 'Sisters of battle' }))
  expect(screen.getByLabelText('Selected faction')).toHaveTextContent('sisters')
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Faction' })).toHaveFocus()
})

test('empty searches, escape, and keyboard selection preserve state correctly', async () => {
  render(<Example />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Faction' }))
  await userEvent.type(screen.getByRole('searchbox'), 'unknown')
  expect(within(screen.getByRole('listbox')).getByRole('status')).toHaveTextContent('No matching options')
  await userEvent.keyboard('{Enter}{Escape}')
  expect(screen.getByLabelText('Selected faction')).toHaveTextContent('tau')
  await userEvent.keyboard('{ArrowDown}')
  expect(screen.getByRole('searchbox')).toHaveValue('')
  await userEvent.type(screen.getByRole('searchbox'), 'sisters')
  await userEvent.keyboard('{Enter}')
  expect(screen.getByLabelText('Selected faction')).toHaveTextContent('sisters')
})

test('filter search retains selections hidden by the search', async () => {
  const onChange = vi.fn()
  render(<MultiSelect label="Faction" options={[{ value: 1, label: 'Tau Empire' }, { value: 2, label: 'Sisters of battle' }]}
    selected={[1]} onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: 'Faction: Tau Empire' }))
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search Faction' }), 'BATTLE')
  expect(screen.queryByRole('checkbox', { name: 'Tau Empire' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Sisters of battle' }))
  expect(onChange).toHaveBeenCalledWith([1, 2])
})
