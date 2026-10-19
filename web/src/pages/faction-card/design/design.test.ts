import { CARD_SIZE, defaultData } from '../model'
import { defaultLayout } from '../layout'
import { OBJECTIVE, TABLE, bannerCenter, forcesGeometry, levelGroups, letterBox, levelOf, objectiveCells, portraitBox, tableBounds, tableItems, tableTransform } from './geometry'
import { hashSeed, mulberry32 } from './paint'
import { DEFAULT_THEME_COLOR, deriveTheme, hexToHsl, isHex, themeColor } from './theme'

test('the theme colour is the card\'s own, else the unit colour, else gold', () => {
  expect(themeColor('#AABBCC', '#112233')).toBe('#aabbcc')
  expect(themeColor('', '#112233')).toBe('#112233')
  expect(themeColor('red', 'not a colour')).toBe(DEFAULT_THEME_COLOR)
  expect(isHex('#12345')).toBe(false)
})

test('every panel colour is derived from the primary colour\'s hue', () => {
  expect(hexToHsl('#ff0000')[0]).toBe(0)
  expect(Math.round(hexToHsl('#00ff00')[0])).toBe(120)
  const gold = deriveTheme('#f3df5e'), blue = deriveTheme('#62a4ec')
  expect(gold.base).toBe('#f3df5e')
  expect(gold.outline).toMatch(/^hsla\(5\d, /)
  expect(blue.outline).toMatch(/^hsla\(2\d\d, /)
  expect(gold.pale).not.toBe('#ffffff')
  // the yellow light-bar artwork is turned from its own hue (52 degrees) to the theme's
  expect(Math.round(deriveTheme('#f3df5e').hue)).toBeCloseTo(0, -1)
  expect(deriveTheme('#62a4ec').hue).toBeGreaterThan(150)
})

test('a chosen panel colour and frame colour override the derived ones', () => {
  const derived = deriveTheme('#62a4ec'), custom = deriveTheme('#62a4ec', { panel: '#ffd0d0', frame: '#222222' })
  expect(custom.mid).toBe('#ffd0d0'); expect(custom.frame).toBe('#222222')
  expect(custom.pale).toMatch(/^hsla\(0, /)
  expect(derived.frame).toBe(derived.outline)
  expect(deriveTheme('#62a4ec', { panel: 'bad', frame: '' }).mid).toBe(derived.mid)
  // the light bars turn to their own colour's hue when one is chosen
  expect(Math.round(deriveTheme('#62a4ec', { light: '#00ff00' }).hue)).toBe(120 - 52)
  expect(deriveTheme('#62a4ec', { light: '' }).hue).toBe(derived.hue)
})

test('the unit table lays rows 222 apart, with 25 more below a forge unit', () => {
  const items = tableItems(defaultData())
  expect(items).toHaveLength(8)
  expect(items.map(i => i.top)).toEqual([TABLE.cityTop, 408, 630, 852, 1074, 1296, 1518, 1765])
  expect(items[0].slot).toBeNull()
  expect(items.map(i => i.forge)).toEqual([0, 0, 0, 0, 0, 0, 1, 1])
  expect(items[7].cy).toBe(1765 + TABLE.cardH / 2)
})

test('a unit without a command level takes the previous one', () => {
  expect(levelOf(null, 2)).toBe(2)
  expect(levelOf(3, 2)).toBe(3)
  const data = defaultData()
  data.units.bastion.tech = null
  expect(tableItems(data)[0].level).toBe(0)
})

test('lines with the same command level share a pipe, and the banner sits in the middle of the group', () => {
  const items = tableItems(defaultData()), groups = levelGroups(items)
  expect(groups.map(g => [g.level, g.idx])).toEqual([[0, [0, 1, 2, 3]], [1, [4]], [2, [5, 6]], [3, [7]]])
  // four lines: between the middle two; one line: on its own torch
  expect(bannerCenter(items, groups[0].idx)).toBe((items[1].cy + items[2].cy) / 2 + 5)
  expect(bannerCenter(items, groups[1].idx)).toBe(items[4].cy + 5)
  const three = tableItems(defaultData())
  expect(bannerCenter(three, [1, 2, 3])).toBe(three[2].cy + 5)
})

test('a forge slot only pushes the next rows down, never the banner off its torch', () => {
  const data = defaultData()
  data.units.fighter.forge = 1
  const items = tableItems(data)
  expect(items[6].top - items[5].top).toBe(TABLE.step + TABLE.forgeExtra)
  const group = levelGroups(items).find(g => g.level === 2)!
  expect(bannerCenter(items, group.idx)).toBe((items[5].cy + items[6].cy) / 2 + 5)
})

test('the table is placed by the layout and fits the card', () => {
  const layout = defaultLayout(), items = tableItems(defaultData()), t = tableTransform(layout, items)
  expect(t.k).toBeCloseTo(TABLE.fit)
  const b = tableBounds(items), px = t.box(b)
  expect(px.x).toBeCloseTo(layout.unitTable.x / 100 * CARD_SIZE.width)
  expect(px.y + px.h).toBeLessThan(CARD_SIZE.height)
  expect(px.x + px.w).toBeLessThan(CARD_SIZE.width)
  layout.unitTable.scale = 0.5
  expect(tableTransform(layout, items).k).toBeCloseTo(TABLE.fit / 2)
})

test('many starting forces are packed to stay on the card', () => {
  const layout = defaultLayout(), few = forcesGeometry(layout, 4), many = forcesGeometry(layout, 8)
  expect(few.rows[1].cy - few.rows[0].cy).toBeCloseTo(layout.forces.pitch! / 100 * CARD_SIZE.height)
  expect(many.rows[1].cy - many.rows[0].cy).toBeLessThan(few.rows[1].cy - few.rows[0].cy)
  expect(many.rows.at(-1)!.count.y + many.rowH).toBeLessThan(CARD_SIZE.height)
  expect(many.title.y + many.title.h).toBeLessThan(many.rows[0].count.y)
})

test('objective frames overlap their text cards and touch tip to tip', () => {
  const layout = defaultLayout(), cells = objectiveCells(layout, 6)
  expect(cells).toHaveLength(6)
  const [a, b, c] = [cells[0], cells[1], cells[2]]
  expect(a.frame.x + a.frame.w).toBeGreaterThan(a.text.x) // the frame covers the card's left edge
  expect(b.frame.x).toBeGreaterThan(a.frame.x) // the second objective is in the second column
  expect(c.frame.y - a.frame.y).toBeCloseTo(layout.objectives.pitch! / 100 * CARD_SIZE.height)
  expect(a.frame.h).toBeCloseTo((OBJECTIVE.bodyH + 2 * OBJECTIVE.tip) * a.u)
})

test('the letter\'s panel wraps the story and both signature lines', () => {
  const layout = defaultLayout(), b = letterBox(layout)
  expect(b.x).toBeLessThan(layout.story.x / 100 * CARD_SIZE.width)
  expect(b.y + b.h).toBeGreaterThan(layout.signatureTitle.y / 100 * CARD_SIZE.height)
})

test('the portrait is as tall as the letter and the panels line up with the objectives', () => {
  const layout = defaultLayout(), l = letterBox(layout), p = portraitBox(layout), cells = objectiveCells(layout, 6)
  expect(p.y).toBe(l.y); expect(p.h).toBe(l.h)
  expect(p.x + p.w).toBeCloseTo(Math.max(...cells.map(c => c.text.x + c.text.w)))
  expect(l.x).toBeCloseTo(Math.min(...cells.map(c => c.frame.x)))
})

test('splatters are seeded, so a card prints the same every time', () => {
  const a = mulberry32(hashSeed('NECRONS-letter')), b = mulberry32(hashSeed('NECRONS-letter')), c = mulberry32(hashSeed('TAU-letter'))
  const first = [a(), a(), a()]
  expect([b(), b(), b()]).toEqual(first)
  expect([c(), c(), c()]).not.toEqual(first)
})
