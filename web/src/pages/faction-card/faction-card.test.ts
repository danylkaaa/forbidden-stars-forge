import { expect, test } from 'vitest'
import { UNIT_SLOTS, defaultData, normalizeData } from './model'
import { richSpans } from './render'

test('every faction starts with the same seven unit rows and six objectives', () => {
  const data = defaultData('Tau')
  expect(Object.keys(data.units)).toEqual(UNIT_SLOTS.map(s => s.key))
  expect(data.objectives).toHaveLength(6)
  expect(data.title).toBe('TAU')
})

test('a stored card is completed with defaults for fields it lacks', () => {
  const data = normalizeData({ title: 'X', units: { infantry: { name: 'Fire Warriors' } } } as never, 'Tau')
  expect(data.title).toBe('X')
  expect(data.units.infantry).toMatchObject({ name: 'Fire Warriors', cost: 2 })
  expect(data.units.champion.name).toBe('Champions')
  expect(data.objectives).toHaveLength(6)
  expect(normalizeData(null, 'Tau').initial).toHaveLength(4)
})

test('double asterisks make bold lead-ins', () => {
  expect(richSpans('**Terror:** When you win')).toEqual([{ text: 'Terror:', bold: true }, { text: ' When you win' }])
  expect(richSpans('plain')).toEqual([{ text: 'plain' }])
})

test('poses saved before the shadow existed get the default shadow', async () => {
  const { withDefaults, DEFAULT_ORIENTATION } = await import('./model')
  expect(withDefaults({ rx: -45, ry: 30 })).toEqual({ ...DEFAULT_ORIENTATION, rx: -45, ry: 30 })
  expect(withDefaults(undefined)).toEqual(DEFAULT_ORIENTATION)
  expect(withDefaults({ shadow: 0 }).shadow).toBe(0)
})

test('cache token rows from older saves are dropped', () => {
  const data = normalizeData({ initial: [{ icon: 'cache', count: 2, label: 'Cache tokens' }, { icon: 'materiel', count: 6, label: 'Materiel' }] } as never, 'Tau')
  expect(data.initial).toEqual([{ icon: 'materiel', count: 6, label: 'Materiel' }])
})
