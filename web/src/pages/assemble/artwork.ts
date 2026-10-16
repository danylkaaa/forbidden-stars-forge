// Tone and colour correction of the artwork. Brightness, contrast and saturation are -100–100 and sharpness 0–100 (0 is
// unchanged); levels are a black point, a white point (0–255) and a gamma (1 is unchanged).
export type ArtworkAdjust = { brightness: number; contrast: number; saturation: number; sharpness: number; black: number; white: number; gamma: number }
export const NEUTRAL_ADJUST: ArtworkAdjust = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0, black: 0, white: 255, gamma: 1 }
export const isNeutralAdjust = (a?: ArtworkAdjust) => !a || (Object.keys(NEUTRAL_ADJUST) as (keyof ArtworkAdjust)[]).every(k => a[k] === NEUTRAL_ADJUST[k])
export type ArtworkTransform = { scale: number; x: number; y: number; adjust?: ArtworkAdjust }
export const defaultArtwork = (): ArtworkTransform => ({ scale: 1, x: 0, y: 0 })
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export function panArtwork(start: ArtworkTransform, dx: number, dy: number): ArtworkTransform {
  return { ...start, x: clamp(start.x + dx, -200, 200), y: clamp(start.y + dy, -200, 200) }
}
// px/py are percentages of the card measured from its centre. Keep the
// artwork point beneath the cursor stationary while zooming.
export function zoomArtwork(t: ArtworkTransform, scale: number, px = 0, py = 0): ArtworkTransform {
  const next = clamp(scale, .1, 5), ratio = next / t.scale
  return { ...t, scale: next, x: clamp(px - (px - t.x) * ratio, -200, 200), y: clamp(py - (py - t.y) * ratio, -200, 200) }
}

// Where the artwork's own edges are on the card, in % of the card (the part outside the artwork window is clipped when
// drawn). Mirrors how the card renderers place it: scaled to cover the window, centred, then moved by the transform.
export function artworkRect(win: { x: number; y: number; width: number; height: number }, art: { width: number; height: number }, card: { width: number; height: number }, t: ArtworkTransform) {
  const ww = win.width * card.width / 100, wh = win.height * card.height / 100
  const scale = Math.max(ww / art.width, wh / art.height) * t.scale
  const width = art.width * scale, height = art.height * scale
  const left = win.x * card.width / 100 + (ww - width) / 2 + t.x * card.width / 100
  const top = win.y * card.height / 100 + (wh - height) / 2 + t.y * card.height / 100
  return { x: left / card.width * 100, y: top / card.height * 100, width: width / card.width * 100, height: height / card.height * 100 }
}
