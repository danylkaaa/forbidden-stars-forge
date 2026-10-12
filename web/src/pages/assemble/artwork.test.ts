import { defaultArtwork, panArtwork, zoomArtwork } from './artwork'
test('pan uses card-relative coordinates with bounded positions', () => {
  expect(panArtwork(defaultArtwork(), 10, -5)).toEqual({ scale: 1, x: 10, y: -5 })
  expect(panArtwork(defaultArtwork(), 1000, -1000)).toEqual({ scale: 1, x: 200, y: -200 })
})
test('zoom keeps the same artwork point below the cursor', () => {
  const t = { scale: 1, x: 10, y: -5 }, px = 25, py = 15
  const next = zoomArtwork(t, 2, px, py)
  expect(next).toEqual({ scale: 2, x: -5, y: -25 })
  expect((px - next.x) / next.scale).toBe((px - t.x) / t.scale)
  expect((py - next.y) / next.scale).toBe((py - t.y) / t.scale)
  expect(zoomArtwork(t, 100).scale).toBe(5)
  expect(zoomArtwork(t, 0).scale).toBe(.1)
})
