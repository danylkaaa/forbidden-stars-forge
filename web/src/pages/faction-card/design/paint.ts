// Canvas painting helpers for the faction card's designed elements. Every helper draws in the
// caller's user space (the card's blocks scale it to "design units": a border is 2 units wide, the
// gap between the two borders 4), so the same numbers work for any block size.
import type { Box } from '../placeholders'
import type { CardTheme } from './theme'

export type Ctx = CanvasRenderingContext2D
export type Drawable = HTMLImageElement | HTMLCanvasElement
export type DesignAssets = { torch: Drawable | null; banner: Drawable | null; light: Drawable | null; texture: Drawable | null; ring: Drawable | null }

export const dims = (image: Drawable) => ({ w: (image instanceof HTMLImageElement ? image.naturalWidth : image.width) || 1, h: (image instanceof HTMLImageElement ? image.naturalHeight : image.height) || 1 })
// Device pixels per user unit (the card's drawing is scaled uniformly).
const scaleOf = (ctx: Ctx) => ctx.getTransform().a

/* ---------- deterministic randomness (a card prints the same every time) ---------- */
export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/* ---------- boxes ---------- */
export const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, w: b.w + 2 * by, h: b.h + 2 * by })
const rectPath = (ctx: Ctx, b: Box) => ctx.rect(b.x, b.y, b.w, b.h)
// The band between a box grown by `from` and by `to` (negative = shrunk), e.g. a border or an outline.
export function band(ctx: Ctx, b: Box, from: number, to: number, color: string) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath(); rectPath(ctx, grow(b, to)); rectPath(ctx, grow(b, from)); ctx.fill('evenodd'); ctx.restore()
}

/* ---------- shadows ---------- */
// Shadows are painted without their shape by drawing the shape far off-canvas and offsetting
// the shadow back; the offset is in device pixels, so it is scaled by hand.
function far(ctx: Ctx) { return 4 * Math.max(ctx.canvas.width, ctx.canvas.height) / scaleOf(ctx) + 2000 }
export type Shadow = { dx: number; dy: number; blur: number; color: string }
// Calls `draw` once per shadow (shadow only), then once plain. `blur` is the CSS drop-shadow() value.
export function withShadows(ctx: Ctx, shadows: Shadow[], draw: () => void) {
  const s = scaleOf(ctx), off = far(ctx)
  for (const sh of shadows) {
    ctx.save(); ctx.translate(-off, 0)
    ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur * 2 * s; ctx.shadowOffsetX = (off + sh.dx) * s; ctx.shadowOffsetY = sh.dy * s
    draw(); ctx.restore()
  }
  draw()
}
// A CSS box-shadow (blur radius `blur`, spread, offset) of a rectangle or an ellipse, without the shape itself.
export function boxShadow(ctx: Ctx, b: Box, o: { blur: number; spread?: number; dx?: number; dy?: number; color: string; round?: boolean }) {
  const s = scaleOf(ctx), off = far(ctx), sp = o.spread ?? 0
  ctx.save()
  ctx.shadowColor = o.color; ctx.shadowBlur = o.blur * s; ctx.shadowOffsetX = (off + (o.dx ?? 0)) * s; ctx.shadowOffsetY = (o.dy ?? 0) * s
  ctx.fillStyle = '#000'; ctx.beginPath()
  if (o.round) ctx.ellipse(b.x + b.w / 2 - off, b.y + b.h / 2, b.w / 2 + sp, b.h / 2 + sp, 0, 0, Math.PI * 2)
  else ctx.rect(b.x - sp - off, b.y - sp, b.w + 2 * sp, b.h + 2 * sp)
  ctx.fill(); ctx.restore()
}
// A shadow along the inside of a shape (CSS inset box-shadow).
export function insetShadow(ctx: Ctx, shape: (ctx: Ctx) => void, blur: number, color: string) {
  const s = scaleOf(ctx)
  ctx.save(); ctx.beginPath(); shape(ctx); ctx.clip()
  ctx.shadowColor = color; ctx.shadowBlur = blur * s; ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); shape(ctx); ctx.fill('evenodd'); ctx.restore()
}

/* ---------- colour filters on images (CSS hue-rotate / saturate / brightness) ---------- */
type Tint = { hue?: number; saturate?: number; brightness?: number }
const tinted = new WeakMap<object, Map<string, HTMLCanvasElement>>()
export function recolor(image: Drawable, t: Tint): Drawable {
  const key = `${(t.hue ?? 0).toFixed(1)}|${t.saturate ?? 1}|${t.brightness ?? 1}`
  if (key === '0.0|1|1') return image
  let perImage = tinted.get(image)
  if (!perImage) tinted.set(image, perImage = new Map())
  const hit = perImage.get(key)
  if (hit) return hit
  const { w, h } = dims(image), out = document.createElement('canvas'); out.width = w; out.height = h
  const octx = out.getContext('2d', { willReadFrequently: true })
  if (!octx) return image
  octx.drawImage(image, 0, 0, w, h)
  const rad = (t.hue ?? 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad), sat = t.saturate ?? 1, br = t.brightness ?? 1
  // hue-rotate, then saturate, then brightness, as one 3 x 3 matrix
  const hue = [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072]
  const sa = [.213 + .787 * sat, .715 - .715 * sat, .072 - .072 * sat, .213 - .213 * sat, .715 + .285 * sat, .072 - .072 * sat, .213 - .213 * sat, .715 - .715 * sat, .072 + .928 * sat]
  const m = new Array<number>(9).fill(0)
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) for (let k = 0; k < 3; k++) m[r * 3 + q] += sa[r * 3 + k] * hue[k * 3 + q] * br
  try {
    const img = octx.getImageData(0, 0, w, h), d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      d[i] = Math.max(0, Math.min(255, m[0] * r + m[1] * g + m[2] * b)); d[i + 1] = Math.max(0, Math.min(255, m[3] * r + m[4] * g + m[5] * b)); d[i + 2] = Math.max(0, Math.min(255, m[6] * r + m[7] * g + m[8] * b))
    }
    octx.putImageData(img, 0, 0)
  } catch { return image }
  perImage.set(key, out)
  return out
}

/* ---------- paper: texture stripes, grain and ink splatters ---------- */
const paperTiles = new Map<string, HTMLCanvasElement>()
// The paper texture stretched to clear light and dark stripes (brightness .571, contrast 5), one tile `size` px wide.
function textureTile(texture: Drawable, size: number): HTMLCanvasElement | null {
  const px = Math.max(8, Math.round(size)), key = `tex${px}`
  const hit = paperTiles.get(key)
  if (hit) return hit
  const tile = document.createElement('canvas'); tile.width = tile.height = px
  const tctx = tile.getContext('2d', { willReadFrequently: true })
  if (!tctx) return null
  tctx.imageSmoothingQuality = 'high'; tctx.drawImage(texture, 0, 0, px, px)
  try {
    const img = tctx.getImageData(0, 0, px, px), d = img.data
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, ((d[i + c] / 255 * .571 - .5) * 5 + .5) * 255))
    tctx.putImageData(img, 0, 0)
  } catch { return null }
  paperTiles.set(key, tile)
  return tile
}
// Fine brown grain, 200 x 200 design units.
function grainTile(): HTMLCanvasElement | null {
  const hit = paperTiles.get('grain')
  if (hit) return hit
  const tile = document.createElement('canvas'); tile.width = tile.height = 200
  const tctx = tile.getContext('2d')
  if (!tctx) return null
  const img = tctx.createImageData(200, 200), rnd = mulberry32(7)
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 89; img.data[i + 1] = 76; img.data[i + 2] = 26; img.data[i + 3] = Math.round(255 * .9 * (.2 + .8 * rnd())) }
  tctx.putImageData(img, 0, 0)
  paperTiles.set('grain', tile)
  return tile
}
function tiled(ctx: Ctx, b: Box, tile: Drawable, tileW: number, tileH: number, ox = 0, oy = 0) {
  ctx.save(); ctx.beginPath(); rectPath(ctx, b); ctx.clip()
  const x0 = b.x + (((ox - b.x) % tileW) + tileW) % tileW - tileW, y0 = b.y + (((oy - b.y) % tileH) + tileH) % tileH - tileH
  for (let y = y0; y < b.y + b.h; y += tileH) for (let x = x0; x < b.x + b.w; x += tileW) ctx.drawImage(tile, x, y, tileW, tileH)
  ctx.restore()
}
export function paperTexture(ctx: Ctx, b: Box, A: DesignAssets) {
  if (!A.texture) return
  const tileUnits = 187, tile = textureTile(A.texture, tileUnits * scaleOf(ctx))
  if (!tile) return
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .75
  tiled(ctx, b, tile, tileUnits, tileUnits, b.x, b.y); ctx.restore()
}
export function paperGrain(ctx: Ctx, b: Box) {
  const tile = grainTile()
  if (!tile) return
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .18; tiled(ctx, b, tile, 200, 200, b.x, b.y); ctx.restore()
}

type Drop = [number, number, number, number, number]
const splatCache = new Map<number, Drop[]>()
// Tiny dark ink splatters: round drops with sprays of fine satellites and lone specks, on a 600 x 300 tile.
function splatDrops(seed: number): Drop[] {
  const hit = splatCache.get(seed)
  if (hit) return hit
  const rnd = mulberry32(seed), r = (a: number, b: number) => a + rnd() * (b - a), W = 600, H = 300, drops: Drop[] = []
  const drop = (x: number, y: number, rad: number) => drops.push([x, y, rad * r(.8, 1.25), rad * r(.8, 1.25), r(0, Math.PI)])
  for (let i = 0; i < 34; i++) {
    const x = r(0, W), y = r(0, H), rad = [1.6, 2, 2.4, 2.9, 3.4][Math.floor(r(0, 5))], ang = r(0, 2 * Math.PI)
    drop(x, y, rad)
    for (let k = Math.floor(r(3, 10)); k--;) {
      const d = r(rad * 2.2, rad * 9), a = ang + (rnd() + rnd() + rnd() - 1.5) * .7
      drop(x + Math.cos(a) * d, y + Math.sin(a) * d, r(.35, 1.1) * Math.max(.5, rad / 2.2))
    }
  }
  for (let i = 0; i < 160; i++) drop(r(0, W), r(0, H), r(.4, 1))
  splatCache.set(seed, drops)
  return drops
}
export function inkSplatters(ctx: Ctx, b: Box, seed: string, offset: [number, number] = [0, 0]) {
  const drops = splatDrops(hashSeed(seed)), W = 600, H = 300
  ctx.save(); ctx.beginPath(); rectPath(ctx, b); ctx.clip(); ctx.globalAlpha = .5; ctx.fillStyle = '#463a26'
  const x0 = b.x + (((offset[0] - b.x) % W) + W) % W - W, y0 = b.y + (((offset[1] - b.y) % H) + H) % H - H
  ctx.beginPath()
  for (let ty = y0; ty < b.y + b.h; ty += H) for (let tx = x0; tx < b.x + b.w; tx += W) for (const [x, y, rx, ry, rot] of drops) {
    const cx = tx + x, cy = ty + y
    if (cx + rx < b.x || cx - rx > b.x + b.w || cy + ry < b.y || cy - ry > b.y + b.h) continue
    ctx.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot)); ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2)
  }
  ctx.fill(); ctx.restore()
}

/* ---------- panels ---------- */
export function screenGradient(ctx: Ctx, b: Box, T: CardTheme) {
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h)
  g.addColorStop(0, T.pale); g.addColorStop(.78, T.mid); g.addColorStop(1, T.pale)
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore()
}
// Four 12-unit squares on the corners of the box grown by 6, translucent with a faint glow.
export function cornerSquares(ctx: Ctx, b: Box, T: CardTheme) {
  const q = 12, e = grow(b, 6)
  const draw = () => { ctx.fillStyle = T.corner; for (const [x, y] of [[e.x, e.y], [e.x + e.w - q, e.y], [e.x, e.y + e.h - q], [e.x + e.w - q, e.y + e.h - q]]) ctx.fillRect(x, y, q, q) }
  ctx.save(); ctx.globalAlpha = .4
  withShadows(ctx, [{ dx: 0, dy: 0, blur: 4, color: T.cornerGlow }, { dx: 0, dy: 0, blur: 1, color: T.cornerEdge }], draw)
  ctx.restore()
}
export const SHADE = { blur: 16, spread: 8, color: 'rgba(0,0,0,.75)' }
export const CARD_SHADOW = { blur: 8, dy: 5, color: 'rgba(0,0,0,.5)' }
// The wide dark shadow that sits below every panel.
export function shade(ctx: Ctx, b: Box) { boxShadow(ctx, b, SHADE) }
// Own border (2 units, inside the panel), a 4-unit gap, then the outer border (2 units).
export function doubleBorder(ctx: Ctx, b: Box, T: CardTheme, inner = true) {
  if (inner) band(ctx, b, -2, 0, T.outline)
  band(ctx, b, 4, 6, T.outline)
}

/** The parchment panel used for cost cards: base colour, own border, paper stripes, outer border, grain, corner squares. */
export function parchmentCard(ctx: Ctx, b: Box, T: CardTheme, A: DesignAssets) {
  boxShadow(ctx, b, CARD_SHADOW)
  ctx.save(); ctx.fillStyle = T.base; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore()
  band(ctx, b, -2, 0, T.outline)
  paperTexture(ctx, b, A)
  band(ctx, b, 4, 6, T.outline)
  paperGrain(ctx, b)
  cornerSquares(ctx, b, T)
}
/** The light panel used for stats screens, letters and name bars: gradient, ink splatters, double border, corner squares. */
export function screenPanel(ctx: Ctx, b: Box, T: CardTheme, seed: string, o: { ownBorder?: boolean; shadow?: boolean } = {}) {
  if (o.shadow !== false) boxShadow(ctx, b, CARD_SHADOW)
  screenGradient(ctx, b, T)
  inkSplatters(ctx, b, seed)
  if (o.ownBorder !== false) band(ctx, b, -2, 0, T.outline)
  band(ctx, b, 4, 6, T.outline)
  cornerSquares(ctx, b, T)
}
/** A title bar or forge slot: gradient, splatters, a 5-unit outline with barely visible side squares. */
export function tabPanel(ctx: Ctx, b: Box, T: CardTheme, seed: string, slot = false) {
  screenGradient(ctx, b, T)
  inkSplatters(ctx, b, seed, [-173, -61])
  band(ctx, b, 0, 5, T.outline)
  ctx.save(); ctx.globalAlpha = .1; ctx.fillStyle = '#fff'
  // The squares start at the outline's top-left corner; a title bar's lower edge is hidden under its card, a slot is outlined all round.
  const top = b.y - 5, bottom = b.y + b.h + (slot ? 5 : 0)
  for (const x of [b.x - 5, b.x + b.w - 5]) for (let y = top; y < bottom; y += 16) ctx.fillRect(x, y, 10, Math.min(10, bottom - y))
  ctx.restore()
}

/* ---------- light bars (light.png) ---------- */
export const LIGHT = { w: 33, h: 518 }
// A horizontal bar made from the vertical artwork turned a quarter. It keeps the artwork's proportions
// and is cropped, never squashed, when shorter than that; longer bars stretch along their length.
export function lightBar(ctx: Ctx, art: Drawable, x1: number, x2: number, cy: number, t: number) {
  const L = x2 - x1
  if (L <= 0) return
  const nat = LIGHT.h * t / LIGHT.w, src = L < nat ? LIGHT.h * L / nat : LIGHT.h
  ctx.save(); ctx.translate(x1, cy - t / 2 + t); ctx.rotate(-Math.PI / 2)
  ctx.drawImage(art, 0, 0, LIGHT.w, src, 0, 0, t, L); ctx.restore()
}
export function lightPipe(ctx: Ctx, art: Drawable, x: number, y1: number, y2: number, t: number) {
  const L = y2 - y1
  if (L <= 0) return
  const nat = LIGHT.h * t / LIGHT.w, src = L < nat ? LIGHT.h * L / nat : LIGHT.h
  ctx.drawImage(art, 0, 0, LIGHT.w, src, x - t / 2, y1, t, L)
}
// Three light bars joining two panels (drawn behind them).
export function connector(ctx: Ctx, art: Drawable | null, x1: number, x2: number, cy: number, spread = 14, t = 9) {
  if (!art) return
  for (const dy of [-spread, 0, spread]) lightBar(ctx, art, x1, x2, cy + dy, t)
}

/* ---------- silhouettes (the white outline round a gear) ---------- */
const silhouettes = new WeakMap<object, HTMLCanvasElement>()
export function silhouette(image: Drawable, color = '#fff'): Drawable {
  const hit = silhouettes.get(image)
  if (hit) return hit
  const { w, h } = dims(image), out = document.createElement('canvas'); out.width = w; out.height = h
  const octx = out.getContext('2d')
  if (!octx) return image
  octx.drawImage(image, 0, 0, w, h); octx.globalCompositeOperation = 'source-in'; octx.fillStyle = color; octx.fillRect(0, 0, w, h)
  silhouettes.set(image, out)
  return out
}
// Draws an image inside a box, whole (contain) or filling it with the overflow cut off (cover).
export function fitImage(ctx: Ctx, image: Drawable, b: Box, mode: 'contain' | 'cover' = 'contain') {
  const { w, h } = dims(image), k = mode === 'contain' ? Math.min(b.w / w, b.h / h) : Math.max(b.w / w, b.h / h)
  ctx.save(); ctx.beginPath(); rectPath(ctx, b); ctx.clip()
  ctx.drawImage(image, b.x + (b.w - w * k) / 2, b.y + (b.h - h * k) / 2, w * k, h * k); ctx.restore()
}
