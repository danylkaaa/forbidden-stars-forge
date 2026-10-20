import { expect, test } from 'vitest'
import { CARD_SIZE, FACTION_CARD_BLEED_MM, FACTION_CARD_CUT_MM, UNIT_SLOTS, defaultData, normalizeData } from './model'
import { ELEMENTS, defaultLayout, elementBox, mergeLayout } from './layout'
import { SAFE_INSET_MM, mmToPx } from '../../components/safeAreaStore'
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

test('shadow, outline and contrast are one shared setting in the layout', () => {
  const layout = mergeLayout({ modelStyle: { shadow: 0.1, contrast: 1.4 } })
  expect(layout.modelStyle).toMatchObject({ shadow: 0.1, contrast: 1.4, innerShadow: 0, outline: 0.012 })
  expect(mergeLayout(undefined).modelStyle.contrast).toBe(1)
  expect(mergeLayout({ title: { x: 5, y: 6 } }).title).toMatchObject({ x: 5, y: 6 })
})

test('the canvas is the cut card plus its bleed, and every default element sits in the safe area', () => {
  expect(CARD_SIZE.width).toBe(Math.round(mmToPx(FACTION_CARD_CUT_MM.width + 2 * FACTION_CARD_BLEED_MM)))
  expect(CARD_SIZE.height).toBe(Math.round(mmToPx(FACTION_CARD_CUT_MM.height + 2 * FACTION_CARD_BLEED_MM)))
  const inset = mmToPx(FACTION_CARD_BLEED_MM + SAFE_INSET_MM), layout = defaultLayout()
  const safe = { left: inset / CARD_SIZE.width * 100, top: inset / CARD_SIZE.height * 100, right: 100 - inset / CARD_SIZE.width * 100, bottom: 100 - inset / CARD_SIZE.height * 100 }
  for (const { key, kind } of ELEMENTS) {
    if (kind === 'style') continue
    const b = elementBox(key, layout)
    expect({ key, left: b.x >= safe.left, top: b.y >= safe.top, right: b.x + b.w <= safe.right, bottom: b.y + b.h <= safe.bottom }).toEqual({ key, left: true, top: true, right: true, bottom: true })
  }
})
