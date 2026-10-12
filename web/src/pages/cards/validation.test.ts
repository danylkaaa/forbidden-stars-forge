import fixtures from '../../../../testdata/card-validation.json'
import { newDraft } from './model'
import { draftInput, parseImport, validateCard } from './validation'
import { exampleImport, readUTF8 } from './import'
for (const c of fixtures) test(`shared JSON rules: ${c.name}`, () => {
  expect(validateCard(c.card, [1]).length === 0).toBe(c.valid)
  const result = parseImport(JSON.stringify({ cards: [c.card] }), [1])
  expect(result.errors.length === 0).toBe(c.valid)
})
test('blank and fractional numeric drafts do not become zero', () => {
  for (const value of ['', ' ', '-1', '1.5', '2e0']) {
    const d = newDraft('combat', '1'); d.name = 'Test'; d.guns = value
    expect(validateCard(draftInput(d), [1]).some(e => e.field === 'guns')).toBe(true)
  }
})
test('envelope, syntax, and indexed errors', () => {
  for (const source of ['{', 'null', '[]', '{"cards":[]}', '{"cards":null}', '{"cards":{}}', JSON.stringify({ ...exampleImport(1), extra: true })]) expect(parseImport(source, [1]).errors.length).toBeGreaterThan(0)
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
    const source = JSON.stringify({ cards: [exampleImport(1).cards[0]] }).replace('"level":0', '"level":' + value)
    expect(parseImport(source, [1]).errors).toEqual([])
  }
})
