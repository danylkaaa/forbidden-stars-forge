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

test('neutral adjustments leave pixels alone and each control moves them the expected way', async () => {
  const { adjustPixels } = await import('./artworkAdjust')
  const { NEUTRAL_ADJUST, isNeutralAdjust } = await import('./artwork')
  const px = () => new Uint8ClampedArray([200, 100, 50, 255, 10, 10, 10, 128])
  const same = px(); adjustPixels(same, 2, 1, NEUTRAL_ADJUST)
  expect([...same]).toEqual([...px()])
  const bright = px(); adjustPixels(bright, 2, 1, { ...NEUTRAL_ADJUST, brightness: 50 })
  expect(bright[0]).toBeGreaterThan(200); expect(bright[3]).toBe(255)
  const gray = px(); adjustPixels(gray, 2, 1, { ...NEUTRAL_ADJUST, saturation: -100 })
  expect(gray[0]).toBe(gray[1]); expect(gray[1]).toBe(gray[2])
  const levels = px(); adjustPixels(levels, 2, 1, { ...NEUTRAL_ADJUST, black: 50, white: 150 })
  expect([levels[0], levels[4]]).toEqual([255, 0])
  expect(isNeutralAdjust({ ...NEUTRAL_ADJUST, gamma: 1.2 })).toBe(false)
})

test('colour, light and vignette controls, and adjustments saved before they existed', async () => {
  const { adjustPixels } = await import('./artworkAdjust')
  const { NEUTRAL_ADJUST, isNeutralAdjust } = await import('./artwork')
  const px = () => new Uint8ClampedArray([200, 100, 50, 255, 10, 10, 10, 255])
  const warm = px(); adjustPixels(warm, 2, 1, { ...NEUTRAL_ADJUST, temperature: 60 })
  expect(warm[0]).toBeGreaterThan(200); expect(warm[2]).toBeLessThan(50)
  const hue = px(); adjustPixels(hue, 2, 1, { ...NEUTRAL_ADJUST, hue: 180 })
  expect(hue[2]).toBeGreaterThan(hue[0]) // a red-orange pixel turns blue-ish
  const lifted = px(); adjustPixels(lifted, 2, 1, { ...NEUTRAL_ADJUST, shadows: 100 })
  expect(lifted[4]).toBeGreaterThan(10); expect(lifted[0]).toBeGreaterThanOrEqual(200)
  const dark = new Uint8ClampedArray(3 * 3 * 4).fill(200); adjustPixels(dark, 3, 3, { ...NEUTRAL_ADJUST, vignette: -100 })
  expect(dark[16]).toBe(200); expect(dark[0]).toBeLessThan(200) // centre kept, corner darkened
  // Values saved before the new controls existed read as unchanged.
  const old = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0, black: 0, white: 255, gamma: 1 }
  expect(isNeutralAdjust(old)).toBe(true)
  const same = px(); adjustPixels(same, 2, 1, old)
  expect([...same]).toEqual([...px()])
})

test('rotation turns in quarter steps, mirroring toggles, and a sideways artwork swaps its width and height', async () => {
  const { defaultArtwork, rotateArtwork, flipArtwork, artworkRect } = await import('./artwork')
  const t = defaultArtwork()
  expect(rotateArtwork(t, -90).rotate).toBe(270)
  expect(rotateArtwork(rotateArtwork(t, 90), 90).rotate).toBe(180)
  expect(flipArtwork(flipArtwork(t)).flip).toBe(false)
  const win = { x: 0, y: 0, width: 50, height: 50 }, card = { width: 100, height: 100 }
  const upright = artworkRect(win, { width: 200, height: 100 }, card, t)
  const sideways = artworkRect(win, { width: 200, height: 100 }, card, rotateArtwork(t, 90))
  expect(upright.width).toBeGreaterThan(upright.height); expect(sideways.height).toBeGreaterThan(sideways.width)
})
