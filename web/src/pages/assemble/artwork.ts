export type ArtworkTransform = { scale: number; x: number; y: number }
export const defaultArtwork = (): ArtworkTransform => ({ scale: 1, x: 0, y: 0 })
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export function panArtwork(start: ArtworkTransform, dx: number, dy: number): ArtworkTransform {
  return { ...start, x: clamp(start.x + dx, -200, 200), y: clamp(start.y + dy, -200, 200) }
}
// px/py are percentages of the card measured from its centre. Keep the
// artwork point beneath the cursor stationary while zooming.
export function zoomArtwork(t: ArtworkTransform, scale: number, px = 0, py = 0): ArtworkTransform {
  const next = clamp(scale, .1, 5), ratio = next / t.scale
  return { scale: next, x: clamp(px - (px - t.x) * ratio, -200, 200), y: clamp(py - (py - t.y) * ratio, -200, 200) }
}
