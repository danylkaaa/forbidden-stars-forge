import { guideOffset, cardOrder, backSlot, besideSlots, pairOfSlot, pairsPerRow, cutGuides, slotRect, mirrorPage, DEFAULT_SETTINGS, gridFor, reconcile, reflow, swapSlots } from './layout'

test('A4 portrait fits 3 × 3 cards of 63 × 88 mm', () => {
  const g = gridFor(DEFAULT_SETTINGS)
  expect([g.cols, g.rows, g.perPage]).toEqual([3, 3, 9])
})

test('back slots mirror columns for long-edge flips of portrait sheets', () => {
  expect([0, 1, 2, 3, 4, 5].map(s => backSlot(s, 3, 3, 'long', 'portrait'))).toEqual([2, 1, 0, 5, 4, 3])
  expect(backSlot(0, 3, 3, 'short', 'portrait')).toBe(6)
  expect(backSlot(0, 3, 3, 'long', 'landscape')).toBe(6)
})

test('reconcile keeps arrangement, fills holes and drops removed cards', () => {
  const pages = [[1, null, 3, 4]]
  expect(reconcile(pages, [1, 3, 4, 5, 6], 4)).toEqual([[1, 5, 3, 4], [6, null, null, null]])
  expect(reconcile(pages, [3], 4)).toEqual([[null, null, 3, null]])
  expect(reconcile(pages, [], 4)).toEqual([])
})

test('reflow compacts and swapSlots swaps across pages', () => {
  expect(reflow([[1, null], [null, 2]], 2)).toEqual([[1, 2]])
  expect(swapSlots([[1, 2], [3, null]], { page: 0, slot: 0 }, { page: 1, slot: 1 })).toEqual([[null, 2], [3, 1]])
})

test('mirrorPage puts each card behind its front', () => {
  expect(mirrorPage([1, 2, null, 4, null, null], 3, 2, 'long', 'portrait')).toEqual([null, 2, 1, null, null, 4])
})

test('even spacing shares free space equally around and between cards', () => {
  const g = gridFor({ ...DEFAULT_SETTINGS, evenSpacing: true })
  expect(g.x0).toBeCloseTo((210 - 3 * 63.5) / 4)
  expect(g.stepX - 63.5).toBeCloseTo(g.x0)
  expect(g.y0).toBeCloseTo((297 - 3 * 88) / 4)
})

test('without trimming, slots are as large as the image', () => {
  const settings = { ...DEFAULT_SETTINGS, trimBleed: false }
  const g = gridFor(settings, { width: 72.9, height: 94.2 })
  expect([g.cols, g.rows]).toEqual([2, 2])
  const r = slotRect(g, settings, 0)
  expect(r.cut.x - r.img.x).toBeCloseTo((72.9 - 63.5) / 2)
  expect(r.clip).toEqual(r.img)
})

test('trimming keeps only the bleed that fits between cards, fitting 3 × 3', () => {
  const g = gridFor(DEFAULT_SETTINGS, { width: 72.9, height: 94.2 })
  expect([g.cols, g.rows]).toEqual([3, 3])
  expect(g.bleedX).toBeCloseTo((g.stepX - 63.5) / 2)
  expect(g.bleedX).toBeLessThan((72.9 - 63.5) / 2)
  const r = slotRect(g, DEFAULT_SETTINGS, 0)
  expect(r.clip.x + r.clip.w).toBeLessThanOrEqual(slotRect(g, DEFAULT_SETTINGS, 1).clip.x + 1e-9)
})

test('extended guides run edge to edge along cut edges of occupied columns and rows', () => {
  const g = gridFor(DEFAULT_SETTINGS)
  const lines = cutGuides(g, DEFAULT_SETTINGS, [1, null, null, null, null, null, null, null, null])
  expect(lines).toHaveLength(4)
  expect(lines.filter(l => l.x1 === l.x2).every(l => l.y1 === 0 && l.y2 === 297)).toBe(true)
})

test('cutting lines lie outside the card by half their width plus the cut tolerance', () => {
  const settings = { ...DEFAULT_SETTINGS, cutTolerance: 2 }, g = gridFor(settings), cut = slotRect(g, settings, 0).cut
  const half = settings.lineWidth * 0.75 / (72 / 25.4) / 2
  expect(DEFAULT_SETTINGS.lineWidth).toBe(1)
  expect(guideOffset({ ...settings, cutTolerance: 0 })).toEqual({ x: half, y: half })
  expect(guideOffset(settings).x).toBeCloseTo(half + 0.02 * settings.cardWidth)
  expect(guideOffset(settings).y).toBeCloseTo(half + 0.02 * settings.cardHeight)
  const lines = cutGuides(g, settings, [1, null, null, null, null, null, null, null, null])
  const xs = lines.filter(l => l.x1 === l.x2).map(l => l.x1).sort((a, b) => a - b), ys = lines.filter(l => l.y1 === l.y2).map(l => l.y1).sort((a, b) => a - b)
  expect(xs[0]).toBeCloseTo(cut.x - guideOffset(settings).x)
  expect(xs[1]).toBeCloseTo(cut.x + cut.w + guideOffset(settings).x)
  expect(ys[0]).toBeCloseTo(cut.y - guideOffset(settings).y)
  expect(ys[1]).toBeCloseTo(cut.y + cut.h + guideOffset(settings).y)
})

test('reconcile places copies of a card: each listing is one place', () => {
  expect(reconcile([], [1, 1, 2], 4)).toEqual([[1, 1, 2, null]])
  const pages = [[1, 2, 1, null]]
  expect(reconcile(pages, [1, 1, 1, 2], 4)).toEqual([[1, 2, 1, 1]])
  expect(reconcile(pages, [1, 2], 4)).toEqual([[1, 2, null, null]])
  expect(reconcile(pages, [2, 2, 1, 1], 4)).toEqual([[1, 2, 1, 2]])
})

test('one-sided printing puts each back right of its front', () => {
  expect(pairsPerRow(3)).toBe(1)
  const sheet = besideSlots([7, 8, null], 4, 2)
  expect(sheet).toEqual([{ id: 7, back: false }, { id: 7, back: true }, { id: 8, back: false }, { id: 8, back: true }, null, null, null, null])
  expect(besideSlots([1, 2, 3], 4, 2).slice(4, 6)).toEqual([{ id: 3, back: false }, { id: 3, back: true }])
  expect([0, 1, 2, 3, 4, 5].map(s => pairOfSlot(s, 5))).toEqual([0, 0, 1, 1, null, 2])
})

test('cards print by type, then level, then name', () => {
  const base = { id: 0, faction_id: 1, created_at: '', updated_at: '' }
  const combat = (name: string, level: number, starting = false) => ({ ...base, category: 'combat' as const, name, level, starting, resource_cost: 0, guns: 0, shields: 0, eagles: 0, upper_text: '', units: [], unit_text: '' })
  const event = (name: string) => ({ ...base, category: 'schema' as const, name, subtype: 'tactic' as const, action: 'move_vertical' as const, text: '' })
  const upgrade = (name: string, level: number) => ({ ...base, category: 'upgrade' as const, name, level, upgrade_type: 'dominate' as const, resource_cost: 0, limitation: '', text: '' })
  const cards = [upgrade('Zeal', 1), event('Chronomancy'), combat('Beta', 2), upgrade('Alpha', 0), combat('Alpha', 2), combat('Start', 0, true), event('Battle Forges'), combat('Gamma', 1)]
  expect(cards.sort(cardOrder).map(c => c.name)).toEqual(['Start', 'Gamma', 'Alpha', 'Beta', 'Battle Forges', 'Chronomancy', 'Alpha', 'Zeal'])
})

test('with no tolerance a faction card\'s cutting lines measure its cut size and its bleed lies beyond them', () => {
  const s = { ...DEFAULT_SETTINGS, orientation: 'landscape' as const, cardWidth: 258, cardHeight: 152, cutTolerance: 0 }
  const g = gridFor(s, { width: 264, height: 158 }), r = slotRect(g, s, 0), line = s.lineWidth * 0.75 / (72 / 25.4)
  const [left, right, top, bottom] = cutGuides(g, s, [1])
  expect(right.x1 - left.x1).toBeCloseTo(258 + line)
  expect(bottom.y1 - top.y1).toBeCloseTo(152 + line)
  expect(left.x1 - r.clip.x).toBeCloseTo(3 - line / 2)
  expect(top.y1 - r.clip.y).toBeCloseTo(3 - line / 2)
})
