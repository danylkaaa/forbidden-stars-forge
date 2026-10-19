// The front's unit table: city and factory, then one row per unit slot, each with a torch on the
// left rail, light bars behind the panels, level banners where the command level changes, and
// the parchment cost card, the stats screen and (for forge units) the forge slot. All numbers
// are design units of the 1290-wide artwork; `tableTransform` maps them onto the card.
import { CARD_SIZE, MODEL_FIELD, UNIT_SLOTS, type FactionCardData, type SlotKey } from '../model'
import type { FactionCardLayout } from '../layout'
import { drawPlaceholder, type Box } from '../placeholders'
import { TABLE, bannerCenter, levelGroups, tableItems, tableTransform, type TableItem } from './geometry'
import { boxShadow, connector, fitImage, insetShadow, lightBar, lightPipe, paperTexture, parchmentCard, recolor, screenPanel, shade, silhouette, tabPanel, withShadows, CARD_SHADOW, type Ctx, type DesignAssets, type Drawable } from './paint'
import { centerNormal, cssLine, fitFont } from './text'
import type { CardTheme } from './theme'

export type IconStyle = { color: string; nx: number; ny: number; shadow: number; blur: number; sx: number; sy: number }
export type FrontIcons = Record<'city' | 'factory' | 'gear' | 'forge' | 'tech' | 'bastion' | 'dice' | 'health' | 'morale', Drawable | null> & { unit: Record<SlotKey, Drawable | null> }
export type FrontInput = {
  data: FactionCardData; layout: FactionCardLayout; theme: CardTheme; assets: DesignAssets; icons: FrontIcons
  styles: { mats: IconStyle; dice: IconStyle; skull: IconStyle; eagle: IconStyle }
  seed: string
}

const PX = 109, PIPE = 16                      // x of the pipe and the level banners, pipe thickness
const CIRCLE_X = 335, FACTORY_X = 818
const FALLOFF = [1, .74, .55, .41, .3, .22, .165, .12, .09, .06, 0]
type JointKind = 'L-dr' | 'L-ur' | 'T'

// Name bars and forge slots: tab = 50 tall, its top 43 above the card.
const tabBox = (x: number, cardTop: number, w: number): Box => ({ x, y: cardTop - 43, w, h: 50 })
const circleShadowBox = (cx: number, cy: number): Box => ({ x: cx - 82, y: cy - 82, w: 164, h: 164 })

function glowStyle(ctx: Ctx, st: IconStyle, size: number, draw: () => void) {
  if (st.shadow <= 0) return draw()
  withShadows(ctx, [{ dx: st.sx * size, dy: st.sy * size, blur: st.blur * size / 2, color: `rgba(0,0,0,${Math.min(1, st.shadow)})` }], draw)
}

// A junction where a branch leaves the vertical pipe: white glow with an exponential falloff, soft at the edges.
function joint(ctx: Ctx, kind: JointKind, x: number, y: number) {
  const s = ctx.getTransform().a, W = 160, H = 120
  const oc = document.createElement('canvas'); oc.width = Math.ceil(W * s); oc.height = Math.ceil(H * s)
  const octx = oc.getContext('2d')
  if (octx) {
    octx.scale(s, s)
    const v = kind === 'L-dr' ? { y: 52, h: 68 } : kind === 'L-ur' ? { y: 0, h: 68 } : { y: 0, h: 120 }
    const across = octx.createLinearGradient(22, 0, 38, 0); across.addColorStop(0, 'rgba(255,255,255,0)'); across.addColorStop(.5, '#fff'); across.addColorStop(1, 'rgba(255,255,255,0)')
    octx.fillStyle = across; octx.fillRect(22, v.y, 16, v.h)
    octx.globalCompositeOperation = 'destination-in'
    const mask = octx.createRadialGradient(30, 60, 0, 30, 60, 75); FALLOFF.forEach((a, i) => mask.addColorStop(i / 10, `rgba(0,0,0,${a})`))
    octx.fillStyle = mask; octx.fillRect(0, 0, W, H)
    ctx.drawImage(oc, x, y, W, H)
  }
  // The corner patch, clipped to the L / T outline.
  const outline = { 'L-dr': 'M30 52 H70 V68 H38 V84 H22 V60 Q22 52 30 52 Z', 'L-ur': 'M22 36 H38 V52 H70 V68 H30 Q22 68 22 60 Z', T: 'M22 36 H38 V52 H70 V68 H38 V84 H22 Z' }[kind]
  ctx.save(); ctx.translate(x, y); ctx.clip(new Path2D(outline))
  const patch = ctx.createRadialGradient(30, 60, 0, 30, 60, 26); patch.addColorStop(0, 'rgba(255,255,255,.55)'); patch.addColorStop(.4, 'rgba(255,255,255,.3)'); patch.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = patch; ctx.fillRect(0, 0, W, H); ctx.restore()
}

// The branch from the pipe to the torch, made from the same artwork as the pipe and merged with it.
function stub(ctx: Ctx, art: Drawable, kind: JointKind, x: number, y: number, w: number) {
  const radii = kind === 'T' ? [0, 8, 8, 0] : kind === 'L-dr' ? [8, 8, 8, 0] : [0, 8, 8, 8]
  ctx.save(); ctx.globalCompositeOperation = 'lighten'; ctx.beginPath(); ctx.roundRect(x, y, w, 16, radii); ctx.clip()
  lightBar(ctx, art, x, x + w, y + 8, 16); ctx.restore()
}

function gear(ctx: Ctx, img: Drawable | null, x: number, y: number, size: number, st: IconStyle) {
  const box = { x, y, w: size, h: size }
  if (!img) return drawPlaceholder(ctx, 'gear', box)
  const body = recolor(img, { hue: 12, saturate: 1.25, brightness: 1.02 }), white = silhouette(body)
  glowStyle(ctx, st, size, () => {
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) fitImage(ctx, white, { ...box, x: x + dx, y: y + dy })
    fitImage(ctx, body, box)
  })
}

// A unit circle: shadow is drawn earlier; this is the paper fill with texture and inner shadow, the miniature and the ring.
function circle(ctx: Ctx, cx: number, cy: number, T: CardTheme, A: DesignAssets, miniature: (c: Ctx) => void) {
  const shape = (c: Ctx) => c.ellipse(cx, cy, 75, 75, 0, 0, Math.PI * 2)
  ctx.save(); ctx.fillStyle = T.base; ctx.beginPath(); shape(ctx); ctx.fill(); ctx.restore()
  ctx.save(); ctx.beginPath(); shape(ctx); ctx.clip(); paperTexture(ctx, { x: cx - 75, y: cy - 75, w: 150, h: 150 }, A); ctx.restore()
  insetShadow(ctx, shape, 14, T.fillShadow)
  miniature(ctx)
  if (A.ring) ctx.drawImage(A.ring, cx - 100, cy - 100 + 1.7, 200, 200) // the ring art is centred 1.7 units above its image centre
}
// The model icons already carry their own outline and shadow (the shared "model style"); structures get the same, so a city and a 3D unit look alike.
const MODEL_ICON_UNITS = 186 // the icon square, in design units, that the style fractions are relative to
function drawFitted(img: Drawable, cx: number, cy: number, w: number, h: number, draw: (img: Drawable, x: number, y: number, w: number, h: number) => void) {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width, ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height
  const k = Math.min(w / (iw || 1), h / (ih || 1)), dw = iw * k, dh = ih * k
  draw(img, cx - dw / 2, cy - dh / 2, dw, dh)
}
function plainIcon(ctx: Ctx, img: Drawable | null, cx: number, cy: number, w: number, h = w) {
  if (img) drawFitted(img, cx, cy, w, h, (i, x, y, dw, dh) => ctx.drawImage(i, x, y, dw, dh))
}
function structureIcon(ctx: Ctx, img: Drawable | null, cx: number, cy: number, w: number, style: FactionCardLayout['modelStyle'], placeholder: string) {
  if (!img) return drawPlaceholder(ctx, placeholder, { x: cx - 45, y: cy - 45, w: 90, h: 90 })
  const width = Math.max(0, style.outline) * MODEL_ICON_UNITS, white = silhouette(img), u = MODEL_ICON_UNITS
  const shadow = { dx: style.shadowX * u, dy: style.shadowY * u, blur: style.shadowBlur * u / 2, color: `rgba(0,0,0,${Math.min(1, Math.max(0, style.shadow))})` }
  withShadows(ctx, [shadow], () => drawFitted(img, cx, cy, w, w, (i, x, y, dw, dh) => {
    if (width > 0) for (let n = 0; n < 28; n++) { const a = n * Math.PI * 2 / 28; ctx.drawImage(white, x + Math.cos(a) * width, y + Math.sin(a) * width, dw, dh) }
    ctx.drawImage(i, x, y, dw, dh)
  }))
}

export function drawUnitTable(ctx: Ctx, p: FrontInput): { warnings: string[] } {
  const { data, layout, theme: T, assets: A, icons, styles } = p, warnings: string[] = []
  const items = tableItems(data), groups = levelGroups(items), t = tableTransform(layout, items)
  const art = A.light ? recolor(A.light, { hue: T.hue }) : null
  const W = CARD_SIZE.width, H = CARD_SIZE.height
  const structure = (key: 'city' | 'factory' | 'bastion', base: number, defaultCx: number, cy: number) => {
    const e = layout[`${key}Icon`], w = base * (e.scale ?? 1), cx = defaultCx + e.x / 100 * W / t.k, y = cy + 5 + e.y / 100 * H / t.k
    structureIcon(ctx, icons[key], cx, y, w, layout.modelStyle, key)
  }

  ctx.save(); ctx.translate(t.ox - TABLE.x0 * t.k, t.oy - TABLE.y0 * t.k); ctx.scale(t.k, t.k)
  ctx.imageSmoothingQuality = 'high'
  const line = items[0], rows = items.slice(1) as (TableItem & { slot: SlotKey })[]

  // 1. the three light bars behind every panel, running through each torch's cage
  if (art) for (const it of items) for (const o of [6.5, 21.5, 35.5]) lightBar(ctx, art, 150, 1130, it.cy - 22 + o + 6, 12)

  // 2. the dark shadows under panels and circles
  const cityTop = line.top
  for (const b of [tabBox(470, cityTop, 138), tabBox(945, cityTop, 140), { x: 457, y: cityTop, w: 168, h: TABLE.cardH }, { x: 930, y: cityTop, w: 168, h: TABLE.cardH }]) shade(ctx, b)
  for (const cx of [CIRCLE_X, FACTORY_X]) boxShadow(ctx, circleShadowBox(cx, line.cy), { blur: 22, spread: 14, color: 'rgba(0,0,0,.8)', round: true })
  for (const r of rows) {
    for (const b of [tabBox(500, r.top, 556), { x: 457, y: r.top, w: 168, h: TABLE.cardH }, { x: 655, y: r.top, w: 443, h: TABLE.cardH }]) shade(ctx, b)
    boxShadow(ctx, circleShadowBox(CIRCLE_X, r.cy), { blur: 22, spread: 14, color: 'rgba(0,0,0,.8)', round: true })
    if (r.forge > 0) shade(ctx, forgeBox(r))
  }

  // 3. torches
  if (A.torch) for (const it of items) withShadows(ctx, [{ dx: 0, dy: 4, blur: 3, color: 'rgba(0,0,0,.6)' }], () => ctx.drawImage(A.torch!, 42, it.cy - 34, 200, 69))

  // 4. the vertical pipe of every level group, with a branch and a joint at each of its lines
  if (art) for (const g of groups) {
    if (g.idx.length < 2) continue
    lightPipe(ctx, art, PX, items[g.idx[0]].cy + 3.6, items[g.idx.at(-1)!].cy + 3.6, PIPE)
    g.idx.forEach((idx, n) => {
      const kind: JointKind = n === 0 ? 'L-dr' : n === g.idx.length - 1 ? 'L-ur' : 'T', cy = items[idx].cy
      stub(ctx, art, kind, kind === 'T' ? PX : PX - 8, cy - 4.4, kind === 'T' ? 139 - PX : 147 - PX)
      joint(ctx, kind, PX - 30, cy - 56.4)
    })
  }

  // 5. level banners
  for (const g of groups) {
    const y = bannerCenter(items, g.idx)
    if (A.banner) withShadows(ctx, [{ dx: 0, dy: 4, blur: 4, color: 'rgba(0,0,0,.6)' }], () => ctx.drawImage(A.banner!, PX - 60, y - 90, 120, 180))
    if (icons.tech) withShadows(ctx, [{ dx: 0, dy: 0, blur: 3, color: '#000' }], () => ctx.drawImage(icons.tech!, PX - 50, y - 51, 100, 102))
    cssLine(ctx, String(g.level), PX, y - 40, 50, 50, { color: '#2b2410', align: 'center' })
  }

  // 6. city and factory
  const cost = (value: number, x: number, top: number) => {
    const m = styles.mats
    cssLine(ctx, String(value), x + m.nx * 92, top + m.ny * 92, 66, 66, { color: m.color })
  }
  const nameBar = (b: Box, name: string, seed: string) => {
    tabPanel(ctx, b, T, seed)
    const label = name.toUpperCase(), fit = fitFont(ctx, label, b.w - 40, 35, 12)
    cssLine(ctx, label, b.x + b.w / 2, b.y + 4, fit.size, 0, { color: '#1c1c1c', align: 'center', squeeze: .95 })
    return fit.fits
  }
  nameBar(tabBox(470, cityTop, 138), 'City', `${p.seed}-city-tab`)
  parchmentCard(ctx, { x: 457, y: cityTop, w: 168, h: TABLE.cardH }, T, A)
  cost(data.city_cost, 472, cityTop + 37); gear(ctx, icons.gear, 512, cityTop + 12, 92, styles.mats)
  circle(ctx, CIRCLE_X, line.cy, T, A, () => structure('city', 92, CIRCLE_X, line.cy))
  circle(ctx, FACTORY_X, line.cy, T, A, () => structure('factory', 90, FACTORY_X, line.cy))
  nameBar(tabBox(945, cityTop, 140), 'Factory', `${p.seed}-factory-tab`)
  parchmentCard(ctx, { x: 930, y: cityTop, w: 168, h: TABLE.cardH }, T, A)
  cost(data.factory_cost, 945, cityTop + 37); gear(ctx, icons.gear, 985, cityTop + 12, 92, styles.mats)

  // 7. unit rows
  const popOuts: (() => void)[] = []
  for (const r of rows) {
    const u = data.units[r.slot], label = UNIT_SLOTS.find(s => s.key === r.slot)!.label
    if (!nameBar(tabBox(500, r.top, 556), u.name, `${p.seed}-${r.slot}-tab`)) warnings.push(`${label} name does not fit its area. Shorten it.`)
    circle(ctx, CIRCLE_X, r.cy, T, A, () => { if (r.slot === 'bastion') structure('bastion', 80, CIRCLE_X, r.cy) })
    // the whole model is drawn last, above everything, so it may overflow its circle (its square is MODEL_FIELD times wider than the model)
    if (r.slot !== 'bastion') popOuts.push(() => plainIcon(ctx, icons.unit[r.slot as SlotKey], CIRCLE_X, r.cy + 4, 186 * MODEL_FIELD))
    parchmentCard(ctx, { x: 457, y: r.top, w: 168, h: TABLE.cardH }, T, A)
    cost(u.cost, 472, r.top + 38); gear(ctx, icons.gear, 512, r.top + 14, 92, styles.mats)
    if (r.forge > 0) forgeSlot(ctx, r, T, icons.forge, `${p.seed}-${r.slot}-forge`)
    // the stats screen: two shadows (its frame and itself), the panel, then the three stats
    const screen = { x: 655, y: r.top, w: 443, h: TABLE.cardH }
    boxShadow(ctx, screen, CARD_SHADOW)
    screenPanel(ctx, screen, T, `${p.seed}-${r.slot}-screen`)
    stat(ctx, icons.dice, { x: 678, y: r.top + 10, w: 102, h: 108 }, 728, r.top + 22, u.dice, styles.dice)
    stat(ctx, icons.health, { x: 820, y: r.top + 8, w: 100, h: 106 }, 870, r.top + 22, u.health, styles.skull)
    stat(ctx, icons.morale, { x: 962, y: r.top + 78, w: 98, h: 38 }, 1010, r.top + 22, u.morale, styles.eagle)
  }
  for (const draw of popOuts) draw()
  ctx.restore()
  return { warnings }
}

function stat(ctx: Ctx, icon: Drawable | null, box: Box, cx: number, top: number, value: number, st: IconStyle) {
  if (icon) glowStyle(ctx, st, box.h, () => fitImage(ctx, icon, box))
  cssLine(ctx, String(value), cx + st.nx * 100, top + st.ny * 100, 58, 58, { color: st.color, align: 'center' })
}

// The slot under a forge unit's cost card: one forge icon per forge requirement.
const forgeBox = (r: TableItem): Box => { const n = Math.max(1, r.forge), w = n === 1 ? 88 : 16 + n * 66; return { x: 541 - w / 2, y: r.top + 124, w, h: TABLE.forgeH } }
function forgeSlot(ctx: Ctx, r: TableItem, T: CardTheme, icon: Drawable | null, seed: string) {
  const b = forgeBox(r)
  tabPanel(ctx, b, T, seed, true)
  if (!icon) return drawPlaceholder(ctx, 'forge', b)
  const tinted = recolor(icon, { hue: -5, saturate: 1.8, brightness: .95 }), n = Math.max(1, r.forge), w = n === 1 ? 78 : 60, step = n === 1 ? 0 : 66
  for (let i = 0; i < n; i++) fitImage(ctx, tinted, { x: b.x + b.w / 2 + (i - (n - 1) / 2) * step - w / 2, y: b.y + 2, w, h: TABLE.forgeH - 4 })
}

// A heading in a resources rectangle (e.g. "Objective tokens"): `size` is the text size in card pixels, the bar grows around it.
export function drawHeadingBar(ctx: Ctx, box: { x: number; y: number; w: number; size: number }, text: string, T: CardTheme, A: DesignAssets, seed: string): boolean {
  const u = box.size / 35, w = box.w / u
  ctx.save(); ctx.translate(box.x, box.y - 6 * u); ctx.scale(u, u)
  // light bars out of both vertical edges, behind the panel
  if (A.light) { const art = recolor(A.light, { hue: T.hue }); connector(ctx, art, -34, 8, 25); connector(ctx, art, w - 8, w + 34, 25) }
  // the resources rectangle: own border, gap, outer border, corner squares
  screenPanel(ctx, { x: 0, y: 0, w, h: 50 }, T, seed)
  const label = text.toUpperCase(), fit = fitFont(ctx, label, w - 40, 35, 12)
  centerNormal(ctx, label, w / 2, 0, 50, fit.size, { color: '#1c1c1c', align: 'center', squeeze: .95 }, 3) // centred in the whole rectangle
  ctx.restore()
  return fit.fits
}

// The whole row, in design units: from the circle's ring and the name bar's outline to the stats screen's outline and the forge slot.
export function unitRowDesignBox(item: TableItem): Box {
  return { x: 228, y: item.top - 50, w: 882, h: (item.forge > 0 ? 175 : 171) + 50 }
}
