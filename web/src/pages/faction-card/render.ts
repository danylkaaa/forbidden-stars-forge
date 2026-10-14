import { loadFonts, loadImage } from '../assemble/render'
import { CARD_SIZE, UNIT_SLOTS, assetKeys, type FactionCardData, type ForcesIcon, type Orientation, type SlotKey } from './model'
import { drawPlaceholder, type Box } from './placeholders'
import { renderModelIcon } from './stl'
import { BUNDLED_ICONS } from './bundled'
import { defaultLayout, scaler, structureIconBox, type FactionCardLayout } from './layout'
import { paintParagraph } from './text'

export type Side = 'front' | 'back'
type Drawable = HTMLImageElement | HTMLCanvasElement
export type ModelIcon = (url: string, orientation: Partial<Orientation>, color: string) => Promise<Drawable>
export type FactionCardInput = {
  side: Side; data: FactionCardData; unitColor: string
  backgroundUrl: string | null
  assets: Record<string, string>   // this faction's uploads by key
  defaults: Record<string, string> // icons shared by every faction
  logoUrl?: string | null // the faction's logo, drawn on both sides
  cardImages?: Record<number, HTMLCanvasElement> // rendered library cards for initial-forces rows
  layout?: FactionCardLayout
  scale?: number // output size relative to the full card (previews use less); drawing is unchanged
  modelIcon?: ModelIcon
}
export type FactionCardResult = { canvas: HTMLCanvasElement; warnings: string[] }

const INK = '#141510', SCRIPT_INK = '#3a2412'
const optional = (url: string | undefined) => url ? loadImage(url).catch(() => null) : Promise.resolve(null)

// Structure icons come with different amounts of empty margin; cropping to the
// drawn pixels lets them all fill their box the same way.
const trimmed = new WeakMap<object, Drawable>()
function trim(image: Drawable): Drawable {
  const cached = trimmed.get(image)
  if (cached) return cached
  let out = image
  try {
    const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width, h = image instanceof HTMLImageElement ? image.naturalHeight : image.height
    const probe = document.createElement('canvas'); probe.width = w; probe.height = h
    const pctx = probe.getContext('2d', { willReadFrequently: true })!
    pctx.drawImage(image, 0, 0)
    const data = pctx.getImageData(0, 0, w, h).data
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    if (x1 >= x0 && y1 >= y0 && (x1 - x0 + 1 < w || y1 - y0 + 1 < h)) {
      const crop = document.createElement('canvas'); crop.width = x1 - x0 + 1; crop.height = y1 - y0 + 1
      crop.getContext('2d')!.drawImage(probe, x0, y0, crop.width, crop.height, 0, 0, crop.width, crop.height)
      out = crop
    }
  } catch { /* keep the original */ }
  trimmed.set(image, out)
  return out
}
// The image with a coloured outline around its silhouette, fitted inside the box.
function outlined(ctx: CanvasRenderingContext2D, image: Drawable, b: Box, width: number, color: string) {
  const pad = Math.ceil(width) + 2
  const tmp = document.createElement('canvas'); tmp.width = Math.ceil(b.w) + 2 * pad; tmp.height = Math.ceil(b.h) + 2 * pad
  const tctx = tmp.getContext('2d')!
  fit(tctx, image, { x: pad, y: pad, w: b.w, h: b.h })
  const ring = document.createElement('canvas'); ring.width = tmp.width; ring.height = tmp.height
  const rctx = ring.getContext('2d')!
  for (let i = 0; i < 28; i++) { const a = i * Math.PI * 2 / 28; rctx.drawImage(tmp, Math.cos(a) * width, Math.sin(a) * width) }
  rctx.globalCompositeOperation = 'source-in'; rctx.fillStyle = color; rctx.fillRect(0, 0, ring.width, ring.height)
  ctx.drawImage(ring, b.x - pad, b.y - pad); ctx.drawImage(tmp, b.x - pad, b.y - pad)
}
function badge(ctx: CanvasRenderingContext2D, kind: 'dice' | 'health' | 'morale', cx: number, cy: number, size: number, value: number) {
  const r = size / 2
  ctx.save()
  ctx.beginPath()
  if (kind === 'dice') for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05) }
  else if (kind === 'health') ctx.arc(cx, cy, r, 0, Math.PI * 2)
  else { ctx.moveTo(cx - r, cy - r * .7); ctx.lineTo(cx, cy - r * .35); ctx.lineTo(cx + r, cy - r * .7); ctx.lineTo(cx + r * .8, cy + r * .6); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * .8, cy + r * .6) }
  ctx.closePath()
  ctx.fillStyle = { dice: '#233fa8', health: '#8a1c1c', morale: '#d9831b' }[kind]; ctx.fill()
  ctx.lineWidth = size * .05; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.font = `${size * .62}px CardHeadline, CardEvent, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(String(value), cx, cy + size * .03)
  ctx.restore()
}
// A stat: its icon with the number on top, or a plain badge if there is no icon.
function stat(ctx: CanvasRenderingContext2D, image: Drawable | null, kind: 'dice' | 'health' | 'morale', cx: number, cy: number, w: number, h: number, value: number, st: IconStyle) {
  if (!image) return badge(ctx, kind, cx, cy, Math.min(w, h), value)
  // The eagle is small and sits under its number; every number is on one level.
  const box = kind === 'morale' ? { x: cx - w / 2, y: cy + h * .1, w, h: h * .55 } : { x: cx - w / 2, y: cy - h / 2, w, h }
  shadowed(ctx, st, h, () => fit(ctx, image, box))
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = h * .08; ctx.shadowOffsetY = h * .03
  centred(ctx, String(value), cx + st.nx * w, cy + h * .03 + st.ny * h, h * .56, st.color); ctx.restore()
}
// Colour, number offset and drop shadow of an icon, from its style element.
type IconStyle = { color: string; nx: number; ny: number; shadow: number; blur: number; sx: number; sy: number }
const iconStyle = (e: { color?: string; nx?: number; ny?: number; shadow?: number; blur?: number; sx?: number; sy?: number }): IconStyle =>
  ({ color: e.color ?? '#ffffff', nx: e.nx ?? 0, ny: e.ny ?? 0, shadow: e.shadow ?? 0, blur: e.blur ?? 0, sx: e.sx ?? 0, sy: e.sy ?? 0 })
function shadowed(ctx: CanvasRenderingContext2D, st: IconStyle, size: number, draw: () => void) {
  ctx.save()
  if (st.shadow > 0) { ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(1, st.shadow)})`; ctx.shadowBlur = st.blur * size; ctx.shadowOffsetX = st.sx * size; ctx.shadowOffsetY = st.sy * size }
  draw(); ctx.restore()
}
function centred(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, color: string, align: CanvasTextAlign = 'center') {
  ctx.save(); ctx.fillStyle = color; ctx.font = `${size}px CardHeadline, CardEvent, serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy); ctx.restore()
}
function fit(ctx: CanvasRenderingContext2D, image: Drawable, b: Box, mode: 'contain' | 'cover' = 'contain') {
  const iw = (image instanceof HTMLImageElement ? image.naturalWidth : image.width) || 1, ih = (image instanceof HTMLImageElement ? image.naturalHeight : image.height) || 1
  const k = mode === 'contain' ? Math.min(b.w / iw, b.h / ih) : Math.max(b.w / iw, b.h / ih)
  ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip()
  ctx.drawImage(image, b.x + (b.w - iw * k) / 2, b.y + (b.h - ih * k) / 2, iw * k, ih * k)
  ctx.restore()
}

// The front card's row for a unit slot (icon, price, name and stats), in output pixels.
export function unitRowBox(slot: SlotKey, layout: FactionCardLayout = defaultLayout()) {
  const { X, Y, S } = scaler(CARD_SIZE.width, CARD_SIZE.height), e = layout.units, k = e.scale ?? 1
  const cy = e.y / 100 * CARD_SIZE.height + UNIT_SLOTS.findIndex(u => u.key === slot) * (e.pitch ?? 0) / 100 * CARD_SIZE.height
  const half = Math.max(Y(62), S(64)) * k
  return { x: e.x / 100 * CARD_SIZE.width - X(114) * k, y: cy - half, w: X(594) * k, h: 2 * half }
}
// The icon area of a unit's row on the front card, in output pixels (click target in the editor).
export function unitIconRect(slot: SlotKey, layout: FactionCardLayout = defaultLayout()) {
  const { X, S } = scaler(CARD_SIZE.width, CARD_SIZE.height), e = layout.units, k = e.scale ?? 1
  const cy = e.y / 100 * CARD_SIZE.height + UNIT_SLOTS.findIndex(u => u.key === slot) * (e.pitch ?? 0) / 100 * CARD_SIZE.height
  return { x: e.x / 100 * CARD_SIZE.width, y: cy - S(52) * k, w: X(140) * k, h: S(104) * k }
}
// The portrait window's outline: chamfered corners, and a pointed tab in the
// middle of the top and bottom edges, as the back frame is drawn. The tabs sit
// inside the box.
export function portraitPath(ctx: CanvasRenderingContext2D, b: Box) {
  const tab = b.h * 0.1, chamfer = Math.min(b.w, b.h) * 0.06, mid = b.x + b.w / 2, base = b.w * 0.14, tip = b.w * 0.05
  const top = b.y + tab, bottom = b.y + b.h - tab, left = b.x, right = b.x + b.w
  ctx.beginPath()
  ctx.moveTo(left + chamfer, top); ctx.lineTo(mid - base, top); ctx.lineTo(mid - tip, b.y); ctx.lineTo(mid + tip, b.y); ctx.lineTo(mid + base, top)
  ctx.lineTo(right - chamfer, top); ctx.lineTo(right, top + chamfer)
  ctx.lineTo(right, bottom - chamfer); ctx.lineTo(right - chamfer, bottom)
  ctx.lineTo(mid + base, bottom); ctx.lineTo(mid + tip, b.y + b.h); ctx.lineTo(mid - tip, b.y + b.h); ctx.lineTo(mid - base, bottom)
  ctx.lineTo(left + chamfer, bottom); ctx.lineTo(left, bottom - chamfer); ctx.lineTo(left, top + chamfer)
  ctx.closePath()
}
export async function renderFactionCard(input: FactionCardInput): Promise<FactionCardResult> {
  const { side, data, unitColor, assets, defaults } = input
  const layout = input.layout ?? defaultLayout()
  const modelIcon = input.modelIcon ?? renderModelIcon
  const keys = side === 'front' ? ['city', 'factory', 'gear', 'forge', 'tech', 'bastion', 'dice', 'health', 'morale'] : ['gear', 'reinforce', 'forge-token', 'city', 'factory', 'bastion']
  const [background, logo, shared, unitIcons, objectiveImages, portrait] = await Promise.all([
    optional(input.backgroundUrl ?? undefined),
    optional(input.logoUrl ?? undefined),
    Promise.all(keys.map(k => optional(defaults[k] ?? BUNDLED_ICONS[k]))),
    Promise.all(UNIT_SLOTS.map(async ({ key }): Promise<Drawable | null> => {
      // The bastion is a structure: always its shared icon, never a model.
      if (key === 'bastion') return null
      const override = assets[assetKeys.icon(key)], model = assets[assetKeys.model(key)]
      if (override) return optional(override)
      if (model) return modelIcon(model, { ...data.models[key], ...layout.modelStyle }, unitColor).catch(() => null)
      return null
    })),
    Promise.all(data.objectives.map((_, i) => side === 'back' ? optional(assets[assetKeys.objective(i)]) : null)),
    side === 'back' ? optional(assets[assetKeys.portrait]) : null,
    loadFonts(),
  ])
  const icon = Object.fromEntries(keys.map((k, i) => [k, shared[i]]))
  const unitIcon = Object.fromEntries(UNIT_SLOTS.map(({ key }, i) => [key, unitIcons[i]])) as Record<SlotKey, Drawable | null>

  const { width: w, height: h } = CARD_SIZE
  const outScale = input.scale ?? 1
  const canvas = document.createElement('canvas'); canvas.width = Math.round(w * outScale); canvas.height = Math.round(h * outScale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the card canvas.')
  ctx.scale(outScale, outScale)
  const { X, Y, S } = scaler(w, h), warnings: string[] = []
  if (background) fit(ctx, background, { x: 0, y: 0, w, h }, 'cover')
  else {
    // No generated image yet: a light parchment gradient keeps the dark text readable.
    const gradient = ctx.createLinearGradient(0, 0, w, h)
    gradient.addColorStop(0, '#f6ecd8'); gradient.addColorStop(1, '#dcc7a5')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h)
  }
  const STRUCTURES = ['city', 'factory', 'bastion']
  const sharedIcon = (key: string, b: Box) => {
    const img = icon[key]
    if (!img) return drawPlaceholder(ctx, key, b)
    if (!STRUCTURES.includes(key)) return fit(ctx, img, b)
    const style = layout[`${key}Icon` as 'cityIcon']
    if ((style.outline ?? 0) > 0) outlined(ctx, trim(img), b, style.outline! * b.h, style.color ?? '#ffffff')
    else fit(ctx, trim(img), b)
  }
  const unitIconBox = (key: SlotKey, b: Box) => {
    const img = unitIcon[key]
    if (img) fit(ctx, img, b)
    else if (key === 'bastion') sharedIcon('bastion', b)
    else drawPlaceholder(ctx, 'none', b)
  }
  const note = (name: string, overflow: boolean) => { if (overflow) warnings.push(`${name} does not fit its area. Shorten it.`) }

  const box = (e: { x: number; y: number; w?: number; h?: number; size?: number }) => ({ x: e.x / 100 * w, y: e.y / 100 * h, width: (e.w ?? 20) / 100 * w, height: e.h === undefined ? undefined : e.h / 100 * h, size: (e.size ?? 2) / 100 * h })
  // A group's origin and scale; offsets inside it are in reference units.
  const group = (e: { x: number; y: number; scale?: number; pitch?: number; gap?: number }) => {
    const k = e.scale ?? 1, ox = e.x / 100 * w, oy = e.y / 100 * h
    return { ox, oy, k, dx: (v: number) => ox + X(v) * k, ss: (v: number) => S(v) * k, pitch: (e.pitch ?? 0) / 100 * h, gap: (e.gap ?? 0) / 100 * w }
  }

  // The faction logo sits in the frame's round medallion, fitted inside its box.
  const logoBox = box(side === 'front' ? layout.logo : layout.backLogo)
  if (logo) fit(ctx, logo, { x: logoBox.x, y: logoBox.y, w: logoBox.width, h: logoBox.height ?? logoBox.width })
  const mats = iconStyle(layout.materialsStyle), dice = iconStyle(layout.diceStyle), skull = iconStyle(layout.healthStyle), eagle = iconStyle(layout.moraleStyle)
  // A price: its number (right-aligned at numberX) and the materials gear (left edge at gearX).
  const cost = (value: string, numberX: number, gearX: number, cy: number, gearSize: number, numberSize: number) => {
    centred(ctx, value, numberX + mats.nx * gearSize, cy + mats.ny * gearSize, numberSize, mats.color, 'right')
    shadowed(ctx, mats, gearSize, () => sharedIcon('gear', { x: gearX, y: cy - gearSize / 2, w: gearSize, h: gearSize }))
  }

  if (side === 'front') {
    const t = box(layout.title)
    note('Title', paintParagraph(ctx, [{ text: data.title }], { x: t.x, y: t.y, width: t.width, size: t.size, lineHeight: 1, color: INK, family: 'CardHeadline', align: 'center' }).overflow)
    const sub = box(layout.subtitle)
    paintParagraph(ctx, [{ text: data.subtitle, bold: true }], { x: sub.x, y: sub.y, width: sub.width, height: sub.height, size: sub.size, lineHeight: 1.1, color: INK, family: 'CardRules', align: 'center' })
    const body = box(layout.text)
    note('Faction text', paintParagraph(ctx, richSpans(data.text), { x: body.x, y: body.y, width: body.width, height: body.height, size: body.size, lineHeight: 1.3, color: INK, family: 'CardRules', paragraphGap: 0.3 }).overflow)
    const heading = box(layout.objectiveHeader)
    paintParagraph(ctx, [{ text: 'OBJECTIVE TOKENS' }], { x: heading.x, y: heading.y, width: heading.width, size: heading.size, lineHeight: 1, color: INK, family: 'CardHeadline', align: 'center' })

    // City and factory.
    for (const [key, label, e] of [['city', 'CITY', layout.city], ['factory', 'FACTORY', layout.factory]] as const) {
      const g = group(e), cy = g.oy + Y(50) * g.k
      sharedIcon(key, structureIconBox(key, layout))
      centred(ctx, label, g.dx(158), g.oy + Y(12) * g.k, g.ss(14), INK)
      cost(String(key === 'city' ? data.city_cost : data.factory_cost), g.dx(139) - g.ss(6), g.dx(141), cy, g.ss(58), g.ss(30))
    }
    // Unit rows.
    const g = group(layout.units)
    let lastTech: number | null | undefined
    UNIT_SLOTS.forEach(({ key }, i) => {
      const u = data.units[key], cy = g.oy + i * g.pitch
      unitIconBox(key, key === 'bastion' ? structureIconBox('bastion', layout) : { x: g.ox, y: cy - g.ss(52), w: X(140) * g.k, h: g.ss(104) })
      cost(String(u.cost), g.dx(152) - g.ss(6), g.dx(152), cy, g.ss(58), g.ss(30))
      for (let n = 0; n < u.forge; n++) sharedIcon('forge', { x: g.dx(145) + n * g.ss(50), y: cy + g.ss(34), w: g.ss(46), h: g.ss(26) })
      note(`${UNIT_SLOTS[i].label} name`, paintParagraph(ctx, [{ text: u.name.toUpperCase() }], { x: g.dx(235), y: cy - Y(52) * g.k, width: X(225) * g.k, size: g.ss(13), lineHeight: 1, color: INK, family: 'CardHeadline', align: 'center' }).overflow)
      stat(ctx, icon.dice, 'dice', g.dx(265), cy + g.ss(8), g.ss(54), g.ss(54), u.dice, dice); stat(ctx, icon.health, 'health', g.dx(345), cy + g.ss(8), g.ss(54), g.ss(54), u.health, skull); stat(ctx, icon.morale, 'morale', g.dx(423), cy + g.ss(8), g.ss(54), g.ss(54), u.morale, eagle)
      if (u.tech !== null && u.tech !== lastTech) {
        sharedIcon('tech', { x: g.dx(-95), y: cy - g.ss(30), w: g.ss(56), h: g.ss(60) })
        centred(ctx, String(u.tech), g.dx(-95) + g.ss(28), cy - g.ss(7), g.ss(26), INK)
      }
      if (u.tech !== null) lastTech = u.tech
    })
  } else {
    const ft = box(layout.forcesTitle)
    paintParagraph(ctx, [{ text: 'INITIAL FORCES:' }], { x: ft.x, y: ft.y, width: ft.width, size: ft.size, lineHeight: 1, color: INK, family: 'CardHeadline', align: 'center' })
    const g = group(layout.forces)
    data.initial.slice(0, 8).forEach((row, i) => {
      const cy = g.oy + i * g.pitch
      centred(ctx, String(row.count), g.dx(23), cy, g.ss(30), INK)
      if (row.icon === 'card') {
        const card = row.card_id ? input.cardImages?.[row.card_id] : undefined
        if (card) shadowed(ctx, { color: '', nx: 0, ny: 0, shadow: 0.6, blur: 0.04, sx: 0.015, sy: 0.03 }, g.ss(108), () => fit(ctx, card, { x: g.dx(57), y: cy - g.ss(54), w: X(96) * g.k, h: g.ss(108) }))
      } else forcesIcon(ctx, row.icon, { x: g.dx(57), y: cy - g.ss(48), w: X(96) * g.k, h: g.ss(96) }, unitIcon, sharedIcon)
      paintParagraph(ctx, [{ text: row.label.toUpperCase() }], { x: g.dx(167), y: cy - g.ss(14), width: X(230) * g.k, size: g.ss(21), lineHeight: 1, color: INK, family: 'CardHeadline', align: 'center' })
    })
    const st = box(layout.story)
    note('Story text', paintParagraph(ctx, richSpans(data.back_text), { x: st.x, y: st.y, width: st.width, height: st.height, size: st.size, lineHeight: 1.38, color: SCRIPT_INK, family: 'CardEvent', italic: true, paragraphGap: 0.25 }).overflow)
    const sig = box(layout.signature), sigTitle = box(layout.signatureTitle)
    paintParagraph(ctx, [{ text: data.signature }], { x: sig.x, y: sig.y, width: sig.width, size: sig.size, lineHeight: 1, color: SCRIPT_INK, family: 'CardEvent', italic: true, align: 'right' })
    paintParagraph(ctx, [{ text: data.signature_title }], { x: sigTitle.x, y: sigTitle.y, width: sigTitle.width, size: sigTitle.size, lineHeight: 1, color: SCRIPT_INK, family: 'CardEvent', italic: true, align: 'right' })
    const pb = box(layout.portrait)
    if (portrait) {
      const area = { x: pb.x, y: pb.y, w: pb.width, h: pb.height ?? 0 }
      ctx.save(); portraitPath(ctx, area); ctx.clip(); fit(ctx, portrait, area, 'cover'); ctx.restore()
    }
    const og = group(layout.objectives)
    data.objectives.forEach((o, i) => {
      const x = og.ox + (i % 2) * og.gap, y = og.oy + Math.floor(i / 2) * og.pitch, pic = objectiveImages[i]
      if (pic) fit(ctx, pic, { x, y, w: X(107) * og.k, h: Y(76) * og.k }, 'cover')
      note(`Objective ${i + 1}`, paintParagraph(ctx, [{ text: o.name ? `${o.name}: ` : '', bold: true }, { text: o.text }], { x: x + X(122) * og.k, y: y + Y(4) * og.k, width: X(285) * og.k, height: Y(70) * og.k, size: og.ss(12.5), lineHeight: 1.2, color: INK, family: 'CardRules', italic: true }).overflow)
    })
  }
  return { canvas, warnings }
}

function forcesIcon(ctx: CanvasRenderingContext2D, icon: ForcesIcon, b: Box, unitIcon: Record<SlotKey, Drawable | null>, shared: (key: string, b: Box) => void) {
  if (icon === 'materiel') shared('gear', b)
  else if (icon === 'reinforcement') shared('reinforce', b)
  else if (icon === 'forge_token') shared('forge-token', b)
  else if (icon === 'city' || icon === 'factory') shared(icon, b)
  else if (icon === 'card') return
  else if (unitIcon[icon]) fit(ctx, unitIcon[icon]!, b)
  else if (icon === 'bastion') shared('bastion', b)
  else drawPlaceholder(ctx, 'none', b)
}

// "Name: text" style bold lead-ins are written as **Name:** in the editor.
export function richSpans(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/).filter(Boolean).map(part => part.startsWith('**') && part.endsWith('**') && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part })
}
export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'))
}
