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

test('the artwork edges follow how the renderer covers the window, centres and moves the artwork', async () => {
  const { artworkRect } = await import('./artwork')
  const win = { x: 20, y: 10, width: 60, height: 50 }, card = { width: 1000, height: 1000 }
  // A square artwork covers a wider-than-tall window by its width, and is centred.
  expect(artworkRect(win, { width: 500, height: 500 }, card, { scale: 1, x: 0, y: 0 })).toEqual({ x: 20, y: 5, width: 60, height: 60 })
  // Zooming 2x grows it around the window's centre; x and y move it in % of the card.
  const zoomed = artworkRect(win, { width: 500, height: 500 }, card, { scale: 2, x: 5, y: -3 })
  expect([zoomed.x, zoomed.y, zoomed.width, zoomed.height].map(Math.round)).toEqual([-5, -28, 120, 120])
})
