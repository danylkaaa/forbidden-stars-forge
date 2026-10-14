import { useEffect, useRef, useState } from 'react'
import teethSrc from '../../images/events/event-teeth.png?url'
import combatBackSrc from '../../images/combat/combat-back.png?url'
import edgeSrc from '../../images/upgrades/upgrade-edge.png?url'
import type { Category } from '../cards/model'

function load(url: string, message = 'Could not load the card back image.') {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img); img.onerror = () => reject(new Error(message))
    img.src = url
  })
}

// Rows of an overlay that contain pixels: the overlays have transparent space
// around the artwork that must not shift where they sit on the card.
const bounds = new Map<string, { top: number; bottom: number }>()
function contentRows(img: HTMLImageElement, key: string) {
  const known = bounds.get(key)
  if (known) return known
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  let top = 0, bottom = img.naturalHeight
  if (ctx) {
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    const filled = (y: number) => { for (let x = 0; x < c.width; x += 4) if (data[(y * c.width + x) * 4 + 3] > 40) return true; return false }
    while (top < c.height - 1 && !filled(top)) top++
    bottom = c.height
    while (bottom > top + 1 && !filled(bottom - 1)) bottom--
  }
  const rows = { top, bottom }
  bounds.set(key, rows)
  return rows
}

// The clear window inside a frame overlay as a share of its size: the
// transparent run through the middle of the image, along both axes.
const windows = new Map<string, { x: number; y: number; w: number; h: number }>()
function frameWindow(img: HTMLImageElement, key: string) {
  const known = windows.get(key)
  if (known) return known
  const W = img.naturalWidth, H = img.naturalHeight
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  let box = { x: 0, y: 0, w: 1, h: 1 }
  if (ctx) {
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, W, H).data
    const clear = (x: number, y: number) => data[(y * W + x) * 4 + 3] < 40
    const cx = W >> 1, cy = H >> 1
    if (clear(cx, cy)) {
      let l = cx, r = cx, t = cy, b = cy
      while (l > 0 && clear(l - 1, cy)) l--
      while (r < W - 1 && clear(r + 1, cy)) r++
      while (t > 0 && clear(cx, t - 1)) t--
      while (b < H - 1 && clear(cx, b + 1)) b++
      box = { x: l / W, y: t / H, w: (r - l + 1) / W, h: (b - t + 1) / H }
    }
  }
  windows.set(key, box)
  return box
}

// The faction's colour: the back image's pixels averaged, the more saturated
// ones counting for more, then pushed a little away from grey.
function factionTint(img: HTMLImageElement): [number, number, number] {
  const c = document.createElement('canvas'); c.width = c.height = 24
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [90, 60, 120]
  ctx.drawImage(img, 0, 0, 24, 24)
  const d = ctx.getImageData(0, 0, 24, 24).data
  let r = 0, g = 0, b = 0, total = 0
  for (let i = 0; i < d.length; i += 4) {
    const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2])
    const weight = 0.05 + (max - min) / 255
    r += d[i] * weight; g += d[i + 1] * weight; b += d[i + 2] * weight; total += weight
  }
  const avg = [r / total, g / total, b / total], grey = (avg[0] + avg[1] + avg[2]) / 3
  const lift = (v: number) => Math.round(Math.min(255, Math.max(0, grey + (v - grey) * 1.4)))
  return [lift(avg[0]), lift(avg[1]), lift(avg[2])]
}

// A deterministic stream of numbers so the nebula looks the same everywhere.
function seeded(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// How an event back's space looks. An empty colour follows the back image.
// `as_template` makes it the front template of card types without a chosen one.
export type NebulaSettings = { color: string; seed: number; density: number; as_template: boolean }
export const DEFAULT_NEBULA: NebulaSettings = { color: '', seed: 7, density: 1, as_template: false }
export function parseColor(hex: string): [number, number, number] | null {
  return /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number] : null
}

// Smooth value noise from a seeded lattice; fractal sums of it make the gas.
function noiseField(seed: number) {
  const rand = seeded(seed * 2654435761 + 1), size = 256, grid = new Float32Array(size * size)
  for (let i = 0; i < grid.length; i++) grid[i] = rand()
  const at = (x: number, y: number) => grid[(y & 255) * size + (x & 255)]
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi)
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  const fbm = (x: number, y: number, octaves: number) => {
    let sum = 0, amp = 0.5, norm = 0
    for (let o = 0; o < octaves; o++) { sum += noise(x, y) * amp; norm += amp; x = x * 2.03 + 17.3; y = y * 2.03 + 9.1; amp *= 0.5 }
    return sum / norm
  }
  return { fbm }
}
const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

// Deep space in the faction colour: warped gas with bright filaments, dark
// dust lanes and a starfield, `width` × `height`.
function proceduralNebula(width: number, height: number, tint: [number, number, number], { seed, density }: NebulaSettings) {
  const out = document.createElement('canvas'); out.width = width; out.height = height
  const outCtx = out.getContext('2d')
  if (!outCtx) return out
  // The gas is computed on a smaller grid and scaled up; stars go on at full size.
  const k = Math.min(1, 560 / Math.max(width, height * 0.74)), w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k))
  const field = noiseField(seed), gas = document.createElement('canvas'); gas.width = w; gas.height = h
  const ctx = gas.getContext('2d')
  if (!ctx) return out
  const img = ctx.createImageData(w, h), px = img.data
  const mix = (m: number, white = 0) => tint.map(v => Math.min(255, v * m + (255 - v * m) * white))
  const ramp = [mix(0.04), mix(0.2), mix(0.55), mix(0.95, 0.1), mix(1, 0.6)]
  const stops = [0, 0.28, 0.55, 0.8, 1]
  const scale = 3.2 / Math.max(h, w * 1.35), ox = (seed % 97) * 3.7, oy = (seed % 89) * 5.3, amount = Math.max(0.2, density)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x * scale + ox, Y = y * scale + oy
    // Domain warping bends the gas into streams and swirls.
    const qx = field.fbm(X, Y, 4), qy = field.fbm(X + 5.2, Y + 1.3, 4)
    const rx = field.fbm(X + 3.5 * qx + 1.7, Y + 3.5 * qy + 9.2, 4), ry = field.fbm(X + 3.5 * qx + 8.3, Y + 3.5 * qy + 2.8, 4)
    const body = field.fbm(X + 3.2 * rx, Y + 3.2 * ry, 5)
    // Thin bright filaments along the folds of the warped field.
    const fold = 1 - Math.abs(2 * field.fbm(X * 1.7 + 4 * rx, Y * 1.7 + 4 * ry, 4) - 1)
    const filaments = fold * fold * fold
    const dust = smooth(0.52, 0.7, field.fbm(X * 0.8 + 2.5 * qx + 30, Y * 0.8 + 2.5 * qy + 14, 4))
    let v = (smooth(0.3 - (amount - 1) * 0.08, 0.85, body) * 0.75 + filaments * smooth(0.35, 0.7, body) * 0.6) * (1 - dust * 0.85)
    v = Math.min(1, v)
    let i = 1; while (i < stops.length - 1 && v > stops[i]) i++
    const t = Math.min(1, Math.max(0, (v - stops[i - 1]) / (stops[i] - stops[i - 1]))), lo = ramp[i - 1], hi = ramp[i], o = (y * w + x) * 4
    px[o] = lo[0] + (hi[0] - lo[0]) * t; px[o + 1] = lo[1] + (hi[1] - lo[1]) * t; px[o + 2] = lo[2] + (hi[2] - lo[2]) * t; px[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  outCtx.imageSmoothingQuality = 'high'
  outCtx.drawImage(gas, 0, 0, width, height)
  // Stars: many faint pin-points, a few with a soft glow.
  const rand = seeded(seed * 40503 + 7), count = Math.round(width * height / 900), star = mix(1, 0.75)
  for (let n = 0; n < count; n++) {
    const x = rand() * width, y = rand() * height, bright = Math.pow(rand(), 6)
    const r = (0.35 + bright * 1.6) * Math.max(1, width / 600)
    outCtx.fillStyle = `rgba(${star.map(Math.round).join(',')},${0.25 + bright * 0.75})`
    outCtx.beginPath(); outCtx.arc(x, y, r, 0, Math.PI * 2); outCtx.fill()
    if (bright > 0.25) {
      const glow = outCtx.createRadialGradient(x, y, 0, x, y, r * 6)
      glow.addColorStop(0, `rgba(${star.map(Math.round).join(',')},${bright * 0.5})`); glow.addColorStop(1, `rgba(${star.map(Math.round).join(',')},0)`)
      outCtx.fillStyle = glow; outCtx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12)
    }
  }
  return out
}

// Your own nebula picture: drop it in src/images/nebula/ (any name, png, jpg
// or webp). It is recoloured per faction, so one picture serves every faction.
const nebulaFiles = import.meta.glob('../../images/nebula/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const nebulaFile = Object.keys(nebulaFiles).sort()[0]
// `picture` is a card type's uploaded nebula; it wins over the bundled one.
const nebulaSources = new Map<string, Promise<HTMLImageElement | null>>()
function loadNebulaSource(picture?: string) {
  const url = picture || (nebulaFile ? nebulaFiles[nebulaFile] : '')
  if (!url) return Promise.resolve(null)
  let known = nebulaSources.get(url)
  if (!known) { known = load(url, 'Could not load the nebula picture.').catch(() => null); nebulaSources.set(url, known) }
  return known
}

// The picture's brightness mapped onto a ramp built from the faction colour
// (near-black, the colour, then a pale highlight), cropped and flipped by the
// seed so different seeds look different. Brightness lifts or dims the gas.
function recolouredNebula(source: HTMLImageElement, width: number, height: number, tint: [number, number, number], { seed, density }: NebulaSettings) {
  const c = document.createElement('canvas'); c.width = width; c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return c
  const rand = seeded(seed * 2654435761 + 1)
  const zoom = 1 + rand() * 0.6, cover = Math.max(width / source.naturalWidth, height / source.naturalHeight) * zoom
  const dw = source.naturalWidth * cover, dh = source.naturalHeight * cover, dx = -(dw - width) * rand(), dy = -(dh - height) * rand()
  ctx.save()
  if (rand() < 0.5) { ctx.translate(width, 0); ctx.scale(-1, 1) }
  if (rand() < 0.5) { ctx.translate(0, height); ctx.scale(1, -1) }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, dx, dy, dw, dh)
  ctx.restore()
  const img = ctx.getImageData(0, 0, width, height), d = img.data
  const mix = (m: number, white = 0) => tint.map(v => Math.min(255, v * m + (255 - v * m) * white))
  const ramp = [mix(0.04), mix(0.22), mix(0.6), mix(0.95, 0.12), mix(1, 0.7)], stops = [0, 0.25, 0.55, 0.8, 1]
  const gain = 1.4 * Math.sqrt(Math.max(0.2, density))
  for (let o = 0; o < d.length; o += 4) {
    const v = Math.min(1, ((0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255) * gain)
    let i = 1; while (i < stops.length - 1 && v > stops[i]) i++
    const t = (v - stops[i - 1]) / (stops[i] - stops[i - 1]), lo = ramp[i - 1], hi = ramp[i]
    d[o] = lo[0] + (hi[0] - lo[0]) * t; d[o + 1] = lo[1] + (hi[1] - lo[1]) * t; d[o + 2] = lo[2] + (hi[2] - lo[2]) * t; d[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// The faction's nebula at `width` × `height`: your picture recoloured, or
// generated when there is no picture.
async function nebula(width: number, height: number, tint: [number, number, number], settings: NebulaSettings, picture?: string) {
  const source = await loadNebulaSource(picture)
  return source ? recolouredNebula(source, width, height, tint, settings) : proceduralNebula(width, height, tint, settings)
}

// Event backs: the teeth sit this far down from the top (and up from the
// bottom) as a share of the card height; space nebula fills beyond them.
const TEETH_AT = 0.107

// Combat backs get a centred frame overlay with the nebula in its window. Upgrade and event backs are symmetrical:
// the decoration at the top is repeated turned over at the bottom.
async function decorate(ctx: CanvasRenderingContext2D, base: HTMLImageElement, w: number, h: number, category: Category, settings: NebulaSettings, overlayScale: number, picture?: string) {
  if (category === 'combat') {
    // Centred, `overlayScale` × the card width; the same for every faction.
    const overlay = await load(combatBackSrc, 'Could not load the combat back overlay.')
    const ow = w * overlayScale, oh = overlay.naturalHeight * (ow / overlay.naturalWidth)
    const ox = (w - ow) / 2, oy = (h - oh) / 2
    // The faction's nebula fills the frame's window, running a little under the frame.
    const win = frameWindow(overlay, 'combat-back'), grow = ow * 0.01
    const nx = ox + win.x * ow - grow, ny = oy + win.y * oh - grow, nw = Math.ceil(win.w * ow + grow * 2), nh = Math.ceil(win.h * oh + grow * 2)
    ctx.drawImage(await nebula(nw, nh, parseColor(settings.color) ?? factionTint(base), settings, picture), nx, ny)
    ctx.drawImage(overlay, ox, oy, ow, oh)
  } else if (category === 'upgrade') {
    const edge = await load(edgeSrc, 'Could not load the upgrade edge.'), rows = contentRows(edge, 'edge')
    const scale = w / edge.naturalWidth, bandH = (rows.bottom - rows.top) * scale
    for (const flip of [false, true]) {
      ctx.save()
      if (flip) { ctx.translate(0, h); ctx.scale(1, -1) }
      ctx.drawImage(edge, 0, rows.top, edge.naturalWidth, rows.bottom - rows.top, 0, 0, w, bandH)
      ctx.restore()
    }
  } else if (category === 'schema') {
    const teeth = await load(teethSrc, 'Could not load the event teeth.'), rows = contentRows(teeth, 'teeth')
    const scale = w / teeth.naturalWidth, bandH = (rows.bottom - rows.top) * scale, at = h * TEETH_AT
    const space = await nebula(w, Math.ceil(at), parseColor(settings.color) ?? factionTint(base), settings, picture)
    for (const flip of [false, true]) {
      ctx.save()
      if (flip) { ctx.translate(0, h); ctx.scale(1, -1) }
      ctx.drawImage(space, 0, 0)
      ctx.drawImage(teeth, 0, rows.top, teeth.naturalWidth, rows.bottom - rows.top, 0, at - bandH / 2, w, bandH)
      ctx.restore()
    }
  }
}

// Mirrors BackImage: the image covers the card, the logo is contained in a
// centred square of `scale` × the card width and height. Event and upgrade
// backs also get their symmetrical decoration.
export async function renderBack(url: string, logoUrl: string | undefined, scale: number, category: Category = 'combat', size = { width: 816, height: 1104 }, settings: NebulaSettings = DEFAULT_NEBULA, overlayScale = 1, picture?: string): Promise<HTMLCanvasElement> {
  const [img, logo] = await Promise.all([load(url), logoUrl ? load(logoUrl) : null])
  const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create a canvas.')
  const cover = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
  ctx.drawImage(img, (canvas.width - img.naturalWidth * cover) / 2, (canvas.height - img.naturalHeight * cover) / 2, img.naturalWidth * cover, img.naturalHeight * cover)
  await decorate(ctx, img, canvas.width, canvas.height, category, settings, overlayScale, picture)
  if (logo) {
    const bw = canvas.width * scale, bh = canvas.height * scale, fit = Math.min(bw / logo.naturalWidth, bh / logo.naturalHeight)
    ctx.drawImage(logo, (canvas.width - logo.naturalWidth * fit) / 2, (canvas.height - logo.naturalHeight * fit) / 2, logo.naturalWidth * fit, logo.naturalHeight * fit)
  }
  return canvas
}

export const hasBackDecor = (category?: Category) => category === 'combat' || category === 'upgrade' || category === 'schema'

// A finished decorated back for on-screen previews; undefined while it is being
// made, for plain backs, or if it cannot be drawn (the plain image shows then).
export function useDecoratedBack(url: string, logoUrl: string | undefined, scale: number, category?: Category, settings: NebulaSettings = DEFAULT_NEBULA, overlayScale = 1, picture?: string) {
  const [state, setState] = useState<{ base: string; url: string } | null>(null)
  const current = useRef('')
  const base = `${url}|${category}`
  useEffect(() => {
    if (!hasBackDecor(category)) return
    let cancelled = false
    renderBack(url, logoUrl, scale, category, { width: 612, height: 828 }, settings, overlayScale, picture)
      .then(canvas => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9)))
      .then(blob => {
        if (!blob || cancelled) return
        const made = URL.createObjectURL(blob), old = current.current
        current.current = made
        setState({ base, url: made })
        // The previous picture stays on screen until the new one is shown.
        if (old) setTimeout(() => URL.revokeObjectURL(old), 1000)
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, logoUrl, scale, category, settings.color, settings.seed, settings.density, overlayScale, picture])
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current) }, [])
  // While a new picture is made the last one for this back stays up, so
  // edits (randomize, sliders) do not flash the plain back.
  return hasBackDecor(category) && state?.base === base ? state.url : undefined
}

// A faction's nebula alone as a card-sized image, for factions with no
// generated template. An empty colour uses `fallback` (the faction's colour).
export async function nebulaTemplateUrl(settings: NebulaSettings, fallback: string, size = { width: 816, height: 1104 }, picture?: string): Promise<string> {
  const tint = parseColor(settings.color) ?? parseColor(fallback) ?? [90, 60, 120]
  return (await nebula(size.width, size.height, tint, settings, picture)).toDataURL('image/jpeg', 0.9)
}
