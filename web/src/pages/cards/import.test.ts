import { expect, test } from 'vitest'
import { exampleImport, importPrompt } from './import'
import { parseImport } from './validation'

test('the example import is valid and shows an upgrade limitation', () => {
  const example = exampleImport(1)
  expect(example.cards.some(c => c.category === 'upgrade' && c.limitation)).toBe(true)
  expect(parseImport(JSON.stringify(example), [1]).errors).toEqual([])
})

test('the AI prompt lists the fields, the factions and the limitation', () => {
  const prompt = importPrompt([{ id: 3, name: 'Tau Empire' }, { id: 4, name: 'Necrons' }])
  for (const text of ['"cards"', 'upgrade_type', 'limitation (optional)', 'faction_id = 3  (Tau Empire)', 'faction_id = 4  (Necrons)', 'orbital_strike', 'faction_id', 'units:', 'unit_text:', '__word__', '(B)', '[S]', '(D)', 'italic', 'Boltgun']) expect(prompt).toContain(text)
})

test('a combat lower text splits into unit names and unit text', async () => {
  const { splitLowerText, lowerText } = await import('./model')
  expect(splitLowerText('Skitarii/Light Cruiser: Force your opponent to lose 1 [B], 1 [S], or 1 [M].')).toEqual({ units: ['Skitarii', 'Light Cruiser'], unit_text: 'Force your opponent to lose 1 [B], 1 [S], or 1 [M].' })
  expect(splitLowerText('Resolve one of the following: Sister Repentia: Replace 1.')).toEqual({ units: [], unit_text: 'Resolve one of the following: Sister Repentia: Replace 1.' })
  expect(splitLowerText('Rout 1 enemy unit. Gain (M).')).toEqual({ units: [], unit_text: 'Rout 1 enemy unit. Gain (M).' })
  expect(splitLowerText('**Battle:** Gain 1 (B).')).toEqual({ units: [], unit_text: '**Battle:** Gain 1 (B).' })
  expect(lowerText({ units: ['Skitarii', 'Light Cruiser'], unit_text: 'Force.' })).toBe('*Skitarii/Light Cruiser* : Force.')
  expect(lowerText({ units: [], unit_text: 'Rout 1 enemy unit.' })).toBe('Rout 1 enemy unit.')
})

test('an import file with an old lower_text is split on the way in', () => {
  const file = JSON.stringify({ cards: [{ faction_id: 1, name: 'x', category: 'combat', level: 1, resource_cost: 1, shields: 0, guns: 1, eagles: 0, upper_text: '', lower_text: 'Skitarii/Light Cruiser: Force your opponent to lose 1 [B].' }] })
  const { cards, errors } = parseImport(file, [1])
  expect(errors).toEqual([])
  expect(cards[0]).toMatchObject({ units: ['Skitarii', 'Light Cruiser'], unit_text: 'Force your opponent to lose 1 [B].' })
  expect(cards[0]).not.toHaveProperty('lower_text')
})

test('unit names must be a list without slashes', () => {
  const file = (units: unknown) => JSON.stringify({ cards: [{ faction_id: 1, name: 'x', category: 'combat', level: 1, resource_cost: 1, shields: 0, guns: 1, eagles: 0, upper_text: '', units, unit_text: '' }] })
  expect(parseImport(file(['A', 'B']), [1]).errors).toEqual([])
  expect(parseImport(file('A/B'), [1]).errors.length).toBeGreaterThan(0)
  expect(parseImport(file(['A/B']), [1]).errors.length).toBeGreaterThan(0)
})
