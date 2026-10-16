import { backSlot, besideSlots, pairOfSlot, pairsPerRow, cutGuides, slotRect, mirrorPage, DEFAULT_SETTINGS, gridFor, reconcile, reflow, swapSlots } from './layout'

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
