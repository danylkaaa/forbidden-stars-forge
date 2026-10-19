import { loadFonts, loadImage } from '../assemble/render'
import { CARD_SIZE, MODEL_FIELD, UNIT_SLOTS, assetKeys, defaultData, withDefaults, type FactionCardData, type ForcesIcon, type InitialRow, type Orientation, type SlotKey } from './model'
import { drawPlaceholder, type Box } from './placeholders'
import { renderModelIcon } from './stl'
import { BUNDLED_ICONS, DESIGN_ASSETS } from './bundled'
import { defaultLayout, logoRect, type FactionCardLayout } from './layout'
import { paintParagraph } from './text'
import { drawForces, drawLetterPanel, drawObjectives, drawPortrait } from './design/back'
import { drawHeadingBar, drawUnitTable, unitRowDesignBox, type FrontIcons } from './design/front'
import { tableItems, tableTransform } from './design/geometry'
import { withShadows, type DesignAssets } from './design/paint'
import { deriveTheme, themeColor } from './design/theme'

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

// Colour, number offset and drop shadow of an icon, from its style element.
type IconStyle = { color: string; nx: number; ny: number; shadow: number; blur: number; sx: number; sy: number }
const iconStyle = (e: { color?: string; nx?: number; ny?: number; shadow?: number; blur?: number; sx?: number; sy?: number }): IconStyle =>
  ({ color: e.color ?? '#ffffff', nx: e.nx ?? 0, ny: e.ny ?? 0, shadow: e.shadow ?? 0, blur: e.blur ?? 0, sx: e.sx ?? 0, sy: e.sy ?? 0 })
function fit(ctx: CanvasRenderingContext2D, image: Drawable, b: Box, mode: 'contain' | 'cover' = 'contain') {
  const iw = (image instanceof HTMLImageElement ? image.naturalWidth : image.width) || 1, ih = (image instanceof HTMLImageElement ? image.naturalHeight : image.height) || 1
  const k = mode === 'contain' ? Math.min(b.w / iw, b.h / ih) : Math.max(b.w / iw, b.h / ih)
  ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip()
  ctx.drawImage(image, b.x + (b.w - iw * k) / 2, b.y + (b.h - ih * k) / 2, iw * k, ih * k)
  ctx.restore()
}

// The front card's row for a unit slot (circle, price, name bar and stats), in output pixels.
export function unitRowBox(slot: SlotKey, layout: FactionCardLayout = defaultLayout(), data: Pick<FactionCardData, 'units'> = defaultData()): Box {
  const items = tableItems(data), item = items.find(i => i.slot === slot)!
  return tableTransform(layout, items).box(unitRowDesignBox(item))
}
// The row plus the room its 3D model may overflow into: what the unit dialog shows.
export function unitPreviewBox(slot: SlotKey, layout: FactionCardLayout = defaultLayout(), data: Pick<FactionCardData, 'units'> = defaultData()): Box {
  const items = tableItems(data), item = items.find(i => i.slot === slot)!, k = 186 * MODEL_FIELD / 2
  return tableTransform(layout, items).box({ x: 335 - k - 6, y: item.top + 65 - k - 6, w: 1110 - (335 - k - 6), h: item.top + 65 + k + 6 - (item.top + 65 - k - 6) })
}
// The city's or the factory's name bar and price card, in output pixels (the click target for editing its price).
export function structurePriceBox(which: 'city' | 'factory', layout: FactionCardLayout = defaultLayout(), data: Pick<FactionCardData, 'units'> = defaultData()): Box {
  return tableTransform(layout, tableItems(data)).box({ x: which === 'city' ? 457 : 930, y: 142, w: 168, h: 165 })
}

// The unit icons are rendered with a wider field of view than the model's own pose asks for, so a large or
// off-centre model is never cut at the edge of its square; the card draws that square MODEL_FIELD times bigger.
// The camera offset and the style fractions are relative to the field, so they shrink by the same factor.
const wideField = (o: Orientation): Orientation => ({
  ...o, scale: o.scale / MODEL_FIELD, x: o.x / MODEL_FIELD, y: o.y / MODEL_FIELD,
  shadowBlur: o.shadowBlur / MODEL_FIELD, shadowX: o.shadowX / MODEL_FIELD, shadowY: o.shadowY / MODEL_FIELD, outline: o.outline / MODEL_FIELD, innerShadowSize: o.innerShadowSize / MODEL_FIELD,
})

export async function renderFactionCard(input: FactionCardInput): Promise<FactionCardResult> {
  const { side, data, unitColor, assets, defaults } = input
  const layout = input.layout ?? defaultLayout()
  const modelIcon = input.modelIcon ?? renderModelIcon
  const keys = side === 'front' ? ['city', 'factory', 'gear', 'forge', 'tech', 'bastion', 'dice', 'health', 'morale'] : ['gear', 'reinforce', 'forge-token', 'city', 'factory', 'bastion']
  const designKeys = ['torch', 'banner', 'light', 'texture', 'ring'] as const
  const [background, logo, shared, unitIcons, objectiveImages, portrait, designImages] = await Promise.all([
    optional(input.backgroundUrl ?? undefined),
    optional(input.logoUrl ?? undefined),
    Promise.all(keys.map(k => optional(defaults[k] ?? BUNDLED_ICONS[k]))),
    Promise.all(UNIT_SLOTS.map(async ({ key }): Promise<Drawable | null> => {
      // The bastion is a structure: always its shared icon, never a model.
      if (key === 'bastion') return null
      const override = assets[assetKeys.icon(key)], model = assets[assetKeys.model(key)]
      if (override) return optional(override)
      if (model) return modelIcon(model, wideField(withDefaults({ ...data.models[key], ...layout.modelStyle })), unitColor).catch(() => null)
      return null
    })),
    Promise.all(data.objectives.map((_, i) => side === 'back' ? optional(assets[assetKeys.objective(i)]) : null)),
    side === 'back' ? optional(assets[assetKeys.portrait]) : null,
    Promise.all(designKeys.map(k => optional(DESIGN_ASSETS[k]))),
    loadFonts(),
  ])
  const icon = Object.fromEntries(keys.map((k, i) => [k, shared[i]]))
  const unitIcon = Object.fromEntries(UNIT_SLOTS.map(({ key }, i) => [key, unitIcons[i]])) as Record<SlotKey, Drawable | null>
  const design = Object.fromEntries(designKeys.map((k, i) => [k, designImages[i]])) as DesignAssets
  // One primary colour (the card's own, else the faction's unit colour) decides every panel colour.
  const theme = deriveTheme(themeColor(data.theme, unitColor), { panel: data.panel_color, frame: data.frame_color, light: data.light_color }), seed = data.title || 'faction'

  const { width: w, height: h } = CARD_SIZE
  const outScale = input.scale ?? 1
  const canvas = document.createElement('canvas'); canvas.width = Math.round(w * outScale); canvas.height = Math.round(h * outScale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the card canvas.')
  ctx.scale(outScale, outScale)
  const warnings: string[] = []
  if (background) fit(ctx, background, { x: 0, y: 0, w, h }, 'cover')
  else {
    // No generated image yet: a light parchment gradient keeps the dark text readable.
    const gradient = ctx.createLinearGradient(0, 0, w, h)
    gradient.addColorStop(0, '#f6ecd8'); gradient.addColorStop(1, '#dcc7a5')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h)
  }
  const sharedIcon = (key: string, b: Box) => {
    const img = icon[key]
    if (!img) return drawPlaceholder(ctx, key, b)
    fit(ctx, img, b)
  }
  const note = (name: string, overflow: boolean) => { if (overflow) warnings.push(`${name} does not fit its area. Shorten it.`) }

  const box = (e: { x: number; y: number; w?: number; h?: number; size?: number }) => ({ x: e.x / 100 * w, y: e.y / 100 * h, width: (e.w ?? 20) / 100 * w, height: e.h === undefined ? undefined : e.h / 100 * h, size: (e.size ?? 2) / 100 * h })

  // The faction logo sits in the frame's round medallion, fitted inside its box.
  const lb = logoRect(side, layout)
  if (logo) fit(ctx, logo, { x: lb.x / 100 * w, y: lb.y / 100 * h, w: lb.w / 100 * w, h: lb.h / 100 * h })

  if (side === 'front') {
    const t = box(layout.title)
    note('Title', paintParagraph(ctx, [{ text: data.title }], { x: t.x, y: t.y, width: t.width, size: t.size, lineHeight: 1, color: INK, family: 'CardHeadline', align: 'center' }).overflow)
    const sub = box(layout.subtitle)
    paintParagraph(ctx, [{ text: data.subtitle, bold: true }], { x: sub.x, y: sub.y, width: sub.width, height: sub.height, size: sub.size, lineHeight: 1.1, color: INK, family: 'CardRules', align: 'center' })
    const body = box(layout.text)
    note('Faction text', paintParagraph(ctx, richSpans(data.text), { x: body.x, y: body.y, width: body.width, height: body.height, size: body.size, lineHeight: 1.3, color: INK, family: 'CardRules', paragraphGap: 0.3 }).overflow)
    const heading = box(layout.objectiveHeader)
    drawHeadingBar(ctx, { x: heading.x, y: heading.y, w: heading.width, size: heading.size }, 'Objective tokens', theme, design, `${seed}-objective-heading`)

    // City, factory and the seven unit rows, drawn as one designed table.
    const icons: FrontIcons = { city: icon.city, factory: icon.factory, gear: icon.gear, forge: icon.forge, tech: icon.tech, bastion: icon.bastion, dice: icon.dice, health: icon.health, morale: icon.morale, unit: unitIcon }
    warnings.push(...drawUnitTable(ctx, {
      data, layout, theme, assets: design, icons, seed,
      styles: { mats: iconStyle(layout.materialsStyle), dice: iconStyle(layout.diceStyle), skull: iconStyle(layout.healthStyle), eagle: iconStyle(layout.moraleStyle) },
    }).warnings)
  } else {
    // Initial forces: a title bar and one pair of cells (number and icon, name) per row.
    warnings.push(...drawForces(ctx, {
      rows: data.initial.slice(0, 8), title: 'Starting forces', layout, theme, assets: design, seed,
      icon: (c, row, b) => forcesIconInto(c, row, b, input, unitIcon, sharedIcon),
    }).warnings)
    // The letter: its panel, then the story and the signature (positions from the layout).
    drawLetterPanel(ctx, layout, theme, seed)
    const st = box(layout.story)
    note('Story text', paintParagraph(ctx, richSpans(data.back_text), { x: st.x, y: st.y, width: st.width, height: st.height, size: st.size, lineHeight: 1.38, color: SCRIPT_INK, family: 'CardEvent', italic: true, paragraphGap: 0.25 }).overflow)
    const sig = box(layout.signature), sigTitle = box(layout.signatureTitle)
    paintParagraph(ctx, [{ text: data.signature }], { x: sig.x, y: sig.y, width: sig.width, size: sig.size, lineHeight: 1, color: SCRIPT_INK, family: 'CardEvent', italic: true, align: 'right' })
    paintParagraph(ctx, [{ text: data.signature_title }], { x: sigTitle.x, y: sigTitle.y, width: sigTitle.width, size: sigTitle.size, lineHeight: 1, color: SCRIPT_INK, family: 'CardEvent', italic: true, align: 'right' })
    drawPortrait(ctx, layout, theme, design, portrait)
    warnings.push(...drawObjectives(ctx, { objectives: data.objectives, pictures: objectiveImages, layout, theme, seed }).warnings)
  }
  return { canvas, warnings }
}

// One row's icon inside its box: a unit model, a structure, a token, or a rendered library card.
function forcesIconInto(ctx: CanvasRenderingContext2D, row: InitialRow, b: Box, input: FactionCardInput, unitIcon: Record<SlotKey, Drawable | null>, shared: (key: string, b: Box) => void) {
  const lift = (draw: () => void) => withShadows(ctx, [{ dx: 0, dy: 5, blur: 4, color: 'rgba(0,0,0,.5)' }], draw)
  if (row.icon === 'card') {
    const card = row.card_id ? input.cardImages?.[row.card_id] : undefined
    if (card) lift(() => fit(ctx, card, b))
    return
  }
  lift(() => forcesIcon(ctx, row.icon, b, unitIcon, shared))
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
