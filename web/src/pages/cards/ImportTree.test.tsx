import { useState } from 'react'
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportTree } from './ImportTree'
import type { CardInput } from './model'
import type { Faction } from '../factions/api'

const factions = [{ id: 1, name: 'Tau' }, { id: 2, name: 'Orks' }] as Faction[]
const combat = (faction_id: number, name: string, starting = false): CardInput => ({ faction_id, name, category: 'combat', starting, level: 0, resource_cost: 0, shields: 0, guns: 0, eagles: 0, upper_text: '', lower_text: '' })
const cards = [combat(1, 'A', true), combat(1, 'B'), combat(2, 'C')]

function Harness() {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set([0, 1, 2]))
  return <><ImportTree cards={cards} factions={factions} selected={selected} onChange={setSelected} /><output>{[...selected].sort().join(',')}</output></>
}

test('factions collapse, and factions and single cards can be unticked', async () => {
  render(<Harness />)
  expect(screen.queryByText('A')).not.toBeInTheDocument() // collapsed by default
  await userEvent.click(screen.getByRole('button', { name: 'Expand Tau' }))
  expect(screen.getByText('A')).toBeInTheDocument()
  expect(screen.getByText(/starting/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select B' }))
  expect(screen.getByRole('status')).toHaveTextContent('0,2')
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select Orks' }))
  expect(screen.getByRole('status')).toHaveTextContent('0')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select all cards' }))
  expect(screen.getByRole('status')).toHaveTextContent('0,1,2')
})
