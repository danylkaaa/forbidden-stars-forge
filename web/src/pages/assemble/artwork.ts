// Tone and colour correction of an image. Brightness, contrast, saturation, vibrance, temperature, tint, shadows,
// highlights and vignette are -100–100, sharpness 0–100 and hue -180–180 degrees (0 is unchanged for all of them);
// levels are a black point, a white point (0–255) and a gamma (1 is unchanged). Adjustments saved before a control
// existed lack it, which means unchanged.
export type ArtworkAdjust = {
  brightness: number; contrast: number; saturation: number; sharpness: number; black: number; white: number; gamma: number
  hue?: number; temperature?: number; tint?: number; vibrance?: number; shadows?: number; highlights?: number; vignette?: number
}
export type FullAdjust = Required<ArtworkAdjust>
export const NEUTRAL_ADJUST: FullAdjust = {
  brightness: 0, contrast: 0, saturation: 0, sharpness: 0, black: 0, white: 255, gamma: 1,
  hue: 0, temperature: 0, tint: 0, vibrance: 0, shadows: 0, highlights: 0, vignette: 0,
}
export const fullAdjust = (a?: ArtworkAdjust): FullAdjust => ({ ...NEUTRAL_ADJUST, ...a })
export const isNeutralAdjust = (a?: ArtworkAdjust) => !a || (Object.keys(NEUTRAL_ADJUST) as (keyof FullAdjust)[]).every(k => (a[k] ?? NEUTRAL_ADJUST[k]) === NEUTRAL_ADJUST[k])
// `flip` mirrors the artwork left to right, then `rotate` turns it clockwise by 0, 90, 180 or 270 degrees.
export type ArtworkTransform = { scale: number; x: number; y: number; adjust?: ArtworkAdjust; flip?: boolean; rotate?: number }
export const turnsSideways = (t: ArtworkTransform) => t.rotate === 90 || t.rotate === 270
export const rotateArtwork = (t: ArtworkTransform, by: 90 | -90): ArtworkTransform => ({ ...t, rotate: (((t.rotate ?? 0) + by) % 360 + 360) % 360 })
export const flipArtwork = (t: ArtworkTransform): ArtworkTransform => ({ ...t, flip: !t.flip })
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
export function artworkRect(win: { x: number; y: number; width: number; height: number }, source: { width: number; height: number }, card: { width: number; height: number }, t: ArtworkTransform) {
  const art = turnsSideways(t) ? { width: source.height, height: source.width } : source
  const ww = win.width * card.width / 100, wh = win.height * card.height / 100
  const scale = Math.max(ww / art.width, wh / art.height) * t.scale
  const width = art.width * scale, height = art.height * scale
  const left = win.x * card.width / 100 + (ww - width) / 2 + t.x * card.width / 100
  const top = win.y * card.height / 100 + (wh - height) / 2 + t.y * card.height / 100
  return { x: left / card.width * 100, y: top / card.height * 100, width: width / card.width * 100, height: height / card.height * 100 }
}
