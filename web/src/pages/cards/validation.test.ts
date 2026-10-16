import fixtures from '../../../../testdata/card-validation.json'
import { newDraft } from './model'
import { draftInput, parseImport, validateCard } from './validation'
import { exampleImport, readUTF8 } from './import'
for (const c of fixtures) test(`shared JSON rules: ${c.name}`, () => {
  expect(validateCard(c.card, [1]).length === 0).toBe(c.valid)
  const result = parseImport(JSON.stringify({ cards: [c.card] }), [1])
  expect(result.errors.length === 0).toBe(c.valid || ['unknown key', 'foreign null field'].includes(c.name))
})
test('blank and fractional numeric drafts do not become zero', () => {
  for (const value of ['', ' ', '-1', '1.5', '2e0']) {
    const d = newDraft('combat', '1'); d.name = 'Test'; d.guns = value
    expect(validateCard(draftInput(d), [1]).some(e => e.field === 'guns')).toBe(true)
  }
})
test('envelope, syntax, and indexed errors', () => {
  for (const source of ['{', 'null', '[]', '{"cards":[]}', '{"cards":null}', '{"cards":{}}']) expect(parseImport(source, [1]).errors.length).toBeGreaterThan(0)
  const result = parseImport(JSON.stringify({ cards: [exampleImport(1).cards[0], { ...exampleImport(1).cards[1], faction_id: 999 }] }), [1])
  expect(result.cards).toEqual([]); expect(result.errors).toContainEqual({ index: 1, field: 'faction_id', message: 'Faction does not exist' })
})
test('downloadable mixed example validates with Unicode and UTF-8 BOM', async () => {
  const text = JSON.stringify(exampleImport(1))
  expect(parseImport('\uFEFF' + text, [1]).cards).toHaveLength(3)
  expect(await readUTF8(new File([text], 'cards.json'))).toBe(text)
  await expect(readUTF8(new File([new Uint8Array([0xff])], 'invalid.json'))).rejects.toThrow('UTF-8')
})

test('equivalent JSON integer forms validate consistently with the backend', () => {
  for (const value of ['0.0', '0e0', '1e0', '3.000']) {
    // A plain level (no starting flag), so every value from 0 to 3 is allowed.
    const { starting: _, ...card } = exampleImport(1).cards[0] as { starting?: boolean }
    const source = JSON.stringify({ cards: [card] }).replace('"level":0', '"level":' + value)
    expect(parseImport(source, [1]).errors).toEqual([])
  }
})


test('import discards envelope metadata and extra fields across all card categories', () => {
  const expected = exampleImport(1).cards
  const cards = expected.map(card => ({ ...card, faction_name: 'Tau', source_file_name: 'deck.pdf', notes: { page: 1 }, unknown: null, ...(card.category === 'combat' ? { text: 'foreign text' } : { guns: 99 }) }))
  expect(parseImport(JSON.stringify({ cards, source: 'deck.pdf' }), [1])).toEqual({ cards: expected, errors: [] })
})

test('extra metadata does not bypass required field validation', () => {
  const card = { ...exampleImport(1).cards[0], guns: null, faction_name: 'Tau' }
  const result = parseImport(JSON.stringify({ cards: [card] }), [1])
  expect(result.cards).toEqual([])
  expect(result.errors).toEqual([{ index: 0, field: 'guns', message: 'Must be an integer from 0 to 9007199254740991' }])
})

test('imported combat cards can be flagged as starting or not', () => {
  const base = { ...exampleImport(1).cards[0] } as Record<string, unknown>
  delete base.level; delete base.resource_cost
  expect(parseImport(JSON.stringify({ cards: [{ ...base, starting: true }] }), [1]).errors).toEqual([])
  const bad = parseImport(JSON.stringify({ cards: [{ ...base, starting: false }] }), [1])
  expect(bad.errors).toContainEqual(expect.objectContaining({ field: 'level' }))
})

test('an upgrade limitation is optional: left out when empty, text when given, never on other cards', () => {
  const upgrade = { faction_id: 1, name: 'Forge World', category: 'upgrade', upgrade_type: 'deploy', level: 1, resource_cost: 2, text: 'Deploy.' }
  expect(validateCard(upgrade, [1])).toEqual([])
  expect(validateCard({ ...upgrade, limitation: 'Limit one per area.' }, [1])).toEqual([])
  expect(validateCard({ ...upgrade, limitation: 5 }, [1]).length).toBeGreaterThan(0)
  const draft = newDraft('upgrade', '1'); draft.name = 'Forge World'
  expect(draftInput(draft)).not.toHaveProperty('limitation')
  draft.limitation = 'Limit one per area.'
  expect(draftInput(draft)).toHaveProperty('limitation', 'Limit one per area.')
  expect(validateCard({ faction_id: 1, name: 'x', category: 'schema', subtype: 'schema', action: 'move_vertical', text: '', limitation: 'no' }, [1]).length).toBeGreaterThan(0)
})

test('an import accepts a null limitation as none, and keeps limitation text', () => {
  const card = (limitation: unknown) => JSON.stringify({ cards: [{ faction_id: 1, name: 'x', category: 'upgrade', upgrade_type: 'deploy', level: 1, resource_cost: 2, text: 't', limitation }] })
  expect(parseImport(card(null), [1])).toMatchObject({ errors: [] })
  expect(parseImport(card(null), [1]).cards[0]).not.toHaveProperty('limitation')
  expect(parseImport(card('Limit one.'), [1]).cards[0]).toHaveProperty('limitation', 'Limit one.')
})

test('an event may move everywhere; any other direction is refused', () => {
  const event = { faction_id: 1, name: 'Anywhere', category: 'schema', subtype: 'tactic', text: 'Go.', action: 'move_everywhere' }
  expect(parseImport(JSON.stringify({ cards: [event] }), [1]).errors).toEqual([])
  expect(parseImport(JSON.stringify({ cards: [{ ...event, action: 'teleport' }] }), [1]).errors).toHaveLength(1)
})
