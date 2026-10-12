import { combatPanels } from './combatPanels'
import { defaultLayout } from './model'
const layout = defaultLayout()
const upper = { text: 'Upper', height: 40, placement: layout.upper_text }
const lower = { text: 'Lower', height: 90, placement: layout.lower_text }
const calculate = (u = upper, l = lower) => combatPanels(1000, 1400, 40, u, l)
test('bottom stays anchored, background contains both blocks, divider follows upper text', () => {
  const p = calculate()
  expect(p.bottomY).toBe(1360)
  expect(p.backgroundY).toBeLessThan(p.upperY)
  expect(p.foregroundY).toBeGreaterThan(p.upperY + upper.height)
  expect(p.lowerY).toBeGreaterThan(p.foregroundY!)
  expect(p.lowerY + lower.height).toBeLessThan(p.bottomY)
  expect(p.overflow).toBe(false)
})
test('more upper lines move parchment up and divider down relative to parchment', () => {
  const short = calculate(), long = calculate({ ...upper, height: 150 })
  expect(long.backgroundY).toBe(short.backgroundY! - 110)
  expect(long.foregroundY! - long.backgroundY!).toBe(short.foregroundY! - short.backgroundY! + 110)
  expect(long.lowerY + lower.height).toBeLessThan(long.bottomY)
})
test('more lower lines expand both panels upward without changing bottom edge', () => {
  const short = calculate(), long = calculate(upper, { ...lower, height: 200 })
  expect(long.backgroundY).toBe(short.backgroundY! - 110)
  expect(long.foregroundY).toBe(short.foregroundY! - 110)
  expect(long.bottomY).toBe(short.bottomY)
})
test('no lower text hides foreground; blank cards still have bottom edge', () => {
  expect(calculate(upper, { ...lower, text: ' \n ' }).foregroundY).toBeNull()
  const empty = calculate({ ...upper, text: '' }, { ...lower, text: '' })
  expect(empty.foregroundY).toBeNull()
  expect(empty.backgroundY).toBeNull()
  expect(empty.bottomY).toBe(1360)
})
test('manual starts are retained and paper follows them; overlaps are reported', () => {
  const p = calculate({ ...upper, placement: { ...layout.upper_text, autoY: false, y: 50 } }, { ...lower, placement: { ...layout.lower_text, autoY: false, y: 60 } })
  expect(p.upperY).toBe(700)
  expect(p.lowerY).toBe(840)
  expect(p.backgroundY).toBeLessThan(700)
  expect(p.foregroundY).toBe(800)
  expect(calculate({ ...upper, height: 200, placement: { ...layout.upper_text, autoY: false, y: 50 } }, { ...lower, placement: { ...layout.lower_text, autoY: false, y: 60 } }).overlap).toBe(true)
})
test('oversized text reports lack of space instead of silently shrinking fonts', () => {
  expect(calculate({ ...upper, height: 1500 }).overflow).toBe(true)
})
