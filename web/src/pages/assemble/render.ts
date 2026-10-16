import { BUNDLED_ICONS } from '../faction-card/bundled'
import { combatRibbon } from './ribbons'
import { defaultArtwork, isNeutralAdjust, type ArtworkTransform } from './artwork'
import { adjustPixels } from './artworkAdjust'
import backgroundSrc from '../../images/combat/background.png?url'
import foregroundSrc from '../../images/combat/foreground.png?url'
import bottomSrc from '../../images/combat/bottom.png?url'
import { combatPanels } from './combatPanels'
import headline from '../../fonts/Headline.woff2?url'
import event from '../../fonts/EventFont.woff2?url'
import symbols from '../../fonts/ForbiddenStars.woff2?url'
import advanceIcon from '../../images/upgrades/advance.png?url'
import deployIcon from '../../images/upgrades/deploy.png?url'
import dominateIcon from '../../images/upgrades/dominate.png?url'
import orbitalStrikeIcon from '../../images/upgrades/orbital strike.png?url'
import strategizeIcon from '../../images/upgrades/strategize.png?url'
import clockwiseIcon from '../../images/events/clockwise.png?url'
import counterclockwiseIcon from '../../images/events/counterclockwise.png?url'
import horizontalIcon from '../../images/events/horizontal.png?url'
import verticalIcon from '../../images/events/vertical.png?url'
import eventChainsSrc from '../../images/events/events-chains.png?url'
import eventBannersSrc from '../../images/events/event-banners.png?url'
import { keyedElement } from './backDecor'
import { EVENT_ELEMENT_HOME, type EventElementInput } from './eventElementPlace'
import { lowerText, type UpgradeType } from '../cards/model'
import { LAYERS, LAYER_LABELS, artWindow, defaultLayout, framedLayers, layerLabel, textRuns, type CombatCard, type Layout, type Placement, type Run, type FramedCard } from './model'

// Average colour of an image's last two rows ('#rrggbb'); a dark neutral if it cannot be read.
function edgeColor(image: HTMLImageElement): string {
  try {
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = 2
    const pctx = probe.getContext('2d', { willReadFrequently: true })!
    pctx.drawImage(image, 0, image.naturalHeight - 2, image.naturalWidth, 2, 0, 0, image.naturalWidth, 2)
    const data = pctx.getImageData(0, 0, probe.width, 2).data
    let r = 0, g = 0, b = 0
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2] }
    const n = data.length / 4
    return '#' + [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('')
  } catch { return '#17130d' }
}
const shade = (hex: string, factor: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0')).join('')
// The standard card's cut height; the bottom border of combat cards stays above it.
const CARD_CUT_HEIGHT_MM = 88
// The hexagon in the middle of an upgrade card shows its order.
export const ORDER_ICONS: Record<UpgradeType, string> = { deploy: deployIcon, advance: advanceIcon, strategize: strategizeIcon, dominate: dominateIcon, orbital_strike: orbitalStrikeIcon }
// The dial on an event card shows how it moves the schema or tactic.
export const ACTION_ICONS: Record<string, string> = { rotate_clockwise: clockwiseIcon, rotate_counterclockwise: counterclockwiseIcon, move_vertical: verticalIcon, move_horizontal: horizontalIcon }

let fonts: Promise<unknown> | undefined
export function loadFonts() {
  return fonts ??= Promise.all([['CardHeadline', headline], ['CardEvent', event], ['CardSymbols', symbols]].map(async ([name, url]) => {
    const face = new FontFace(name, `url("${url}")`)
    await face.load()
    document.fonts.add(face)
  }).concat((async () => {
    // Exclude the font's substituted punctuation from ordinary prose.
    const rules = new FontFace('CardRules', `url("${symbols}")`, { unicodeRange: 'U+20-22,U+26-3B,U+3D,U+3F,U+41-5A,U+5C,U+5E-7A,U+7C,U+7E-10FFFF' })
    await rules.load(); document.fonts.add(rules)
  })())).catch(error => { fonts = undefined; throw error })
}
const images = new Map<string, Promise<HTMLImageElement>>()
export function loadImage(url: string) {
  let pending = images.get(url)
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => { images.delete(url); reject(new Error('Could not load artwork or overlay. Choose another image or retry.')) }
      img.src = url
    })
    images.set(url, pending)
  }
  return pending
}
type Atom = Run & { width: number }
function font(run: Run, size: number, family: string) { return `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}${size}px ${run.icon ? 'CardSymbols' : family}, CardEvent, serif` }
// Measure the same runs we paint: symbols occupy one glyph and stay intact
// during wrapping. Newlines and long words are supported without squeezing.
// Lines that begin a new paragraph (after a typed line break), as opposed to a wrapped continuation.
const paragraphStarts = new WeakSet<Atom[]>()
export function wrapText(runs: Run[], maxWidth: number, measure: (run: Run) => number): Atom[][] {
  const lines: Atom[][] = [[]]
  let width = 0
  // The space dropped where the last line broke, in case the next icon needs it to stay with its number.
  let dropped: Atom | null = null
  const newline = () => { lines.push([]); width = 0 }
  const blank = (atom: Atom) => !atom.icon && /^\s+$/.test(atom.text)
  // Takes a number (and the spaces after it) off the end of a line, so an icon never starts a line without it.
  const takeNumber = (line: Atom[], space: Atom | null): Atom[] => {
    const spaces: Atom[] = []
    while (line.length && blank(line.at(-1)!)) spaces.unshift(line.pop()!)
    const num = line.at(-1)
    if (!num || num.icon || !/^\d+$/.test(num.text)) { line.push(...spaces); return [] }
    line.pop()
    return [num, ...(spaces.length ? spaces : space ? [space] : [])]
  }
  const place = (atoms: Atom[]) => { for (const atom of atoms) { lines.at(-1)!.push(atom); width += atom.width } }
  // A space that does not fit at the end of a line hangs there: it starts no line of its own, and the next word
  // (unless it is a typed line break) goes to the next line.
  let pendingBreak = false
  for (const run of runs) {
    const parts = run.icon ? [run.text] : run.text.split(/(\n|[^\S\n]+|[^\s]+)/g).filter(Boolean)
    for (const text of parts) {
      if (text === '\n') { newline(); paragraphStarts.add(lines.at(-1)!); dropped = null; pendingBreak = false; continue }
      const word = { ...run, text }
      const wordWidth = measure(word)
      const space = /^\s+$/.test(text)
      if (space && width === 0) continue
      if (space && width + wordWidth > maxWidth) { pendingBreak = true; dropped = { ...word, width: wordWidth }; continue }
      if (pendingBreak || (width > 0 && width + wordWidth > maxWidth)) {
        const carry = run.icon ? takeNumber(lines.at(-1)!, dropped) : []
        newline()
        pendingBreak = false
        if (carry.length) place(carry)
      }
      dropped = null
      if (wordWidth > maxWidth && !run.icon) {
        for (const char of text) {
          const atom = { ...run, text: char, width: measure({ ...run, text: char }) }
          if (width > 0 && width + atom.width > maxWidth) newline()
          lines.at(-1)!.push(atom); width += atom.width
        }
      } else { lines.at(-1)!.push({ ...word, width: wordWidth }); width += wordWidth }
    }
  }
  return lines
}
export function paintRun(ctx: CanvasRenderingContext2D, run: Run, x: number, baseline: number, size: number) {
  if (run.dice) {
    // An outlined isometric cube, matching the original card's dice symbol.
    // Its stroke uses the text colour and scales with the surrounding font.
    const left = x + size * .08, top = baseline - size * .82
    const width = size * .74, height = size * .82
    ctx.save(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = size * .035; ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(left + width / 2, top)
    ctx.lineTo(left + width, top + height * .18)
    ctx.lineTo(left + width, top + height * .76)
    ctx.lineTo(left + width / 2, top + height)
    ctx.lineTo(left, top + height * .76)
    ctx.lineTo(left, top + height * .18)
    ctx.closePath()
    ctx.moveTo(left, top + height * .18)
    ctx.lineTo(left + width / 2, top + height * .38)
    ctx.lineTo(left + width, top + height * .18)
    ctx.moveTo(left + width / 2, top + height * .38)
    ctx.lineTo(left + width / 2, top + height)
    ctx.stroke(); ctx.restore()
  } else if (run.unframed) {
    ctx.save(); ctx.beginPath(); ctx.rect(x + size * .08, baseline - size * .78, size * .82, size * .82); ctx.clip()
    ctx.fillText(run.text, x, baseline); ctx.restore()
  } else ctx.fillText(run.text, x, baseline)
}
// Extra space between paragraphs, as a fraction of the font size.
const PARAGRAPH_GAP = 0.4
export function measureBlock(ctx: CanvasRenderingContext2D, text: string, p: Placement, family: string, w: number, h: number) {
  const size = p.size * h / 100
  const lineHeight = size * p.lineHeight
  const measure = (run: Run) => { ctx.font = font(run, size, family); return run.dice ? size * .9 : ctx.measureText(run.text).width }
  const lines = wrapText(textRuns(text), p.width * w / 100, measure)
  let ascent = 0, descent = 0
  for (const line of lines) {
    // Trailing spaces must not push a centered line away from its visual centre.
    while (line.length && /^\s+$/.test(line.at(-1)!.text)) line.pop()
    for (const atom of line) {
      if (!atom.text.trim()) continue
      ctx.font = font(atom, size, family)
      const metrics = atom.dice ? { actualBoundingBoxAscent: size * .84, actualBoundingBoxDescent: size * .02 } : ctx.measureText(atom.text)
      ascent = Math.max(ascent, metrics.actualBoundingBoxAscent ?? size * .82)
      descent = Math.max(descent, metrics.actualBoundingBoxDescent ?? size * .18)
    }
  }
  // Each paragraph after the first is set apart by a little extra space.
  let paragraphs = 0
  const offsets = lines.map((line, i) => { if (i > 0 && paragraphStarts.has(line)) paragraphs++; return i * lineHeight + paragraphs * size * PARAGRAPH_GAP })
  const height = text.trim() ? offsets.at(-1)! + ascent + descent : 0
  return { size, lineHeight, lines, offsets, ascent, height }
}
// Text is left aligned unless the caller (the event card's label) asks otherwise.
function paintText(ctx: CanvasRenderingContext2D, text: string, p: Placement, family: string, w: number, h: number, align: 'left' | 'center' | 'digit' = 'left'): boolean {
  const { size, lines, offsets, ascent, height: textHeight } = measureBlock(ctx, text, p, family, w, h)
  ctx.fillStyle = p.color
  // Centre visible glyph bounds, including inline icons, rather than the font's em box.
  const top = p.y * h / 100 + (p.verticalAlign === 'center' ? Math.max(0, (p.height * h / 100 - textHeight) / 2) : 0)
  for (const [i, line] of lines.entries()) {
    let x = p.x * w / 100
    // Centred lines are placed within the box width.
    if (align === 'center') {
      const free = p.width * w / 100 - line.reduce((sum, atom) => sum + atom.width, 0)
      x += free / 2
    } else if (align === 'digit') {
      // Centre the visible digits in the box: the font's "1" has uneven side
      // bearings, so its advance width is no guide to where its ink is.
      let left = Infinity, right = -Infinity, cursor = 0
      for (const atom of line) {
        ctx.font = font(atom, size, family)
        const m = ctx.measureText(atom.text)
        left = Math.min(left, cursor - m.actualBoundingBoxLeft); right = Math.max(right, cursor + m.actualBoundingBoxRight)
        cursor += atom.width
      }
      if (Number.isFinite(left)) x += p.width * w / 200 - (left + right) / 2
    }
    for (const atom of line) {
      ctx.font = font(atom, size, family)
      paintRun(ctx, atom, x, top + ascent + offsets[i], size)
      x += atom.width
    }
  }
  return text.length > 0 && (textHeight > p.height * h / 100 || p.x < 0 || p.y < 0 || p.x + p.width > 100 || p.y * h / 100 + textHeight > h)
}
// The outlined square variants contain positive gun/shield/eagle shapes.
// Clip away their square frame to get the white resource strip in the reference.
// The inset follows the supplied font's 2048-unit glyph bounds.
// Rows of the 759 px wide parchment textures that are decoration, not
// writing space: background.png's top border (0–20) and foreground.png's
// transparent strip (0–5) plus divider bar (6–17).
function textureInsets(scale: number, foregroundScale = scale) {
  return { background: 21 * scale, dividerTop: 6 * foregroundScale, foreground: 18 * foregroundScale }
}
// The resource column stacks guns, then shields, then morale.
const RESOURCES = ['guns', 'shields', 'eagles'] as const
const PLAIN_GLYPHS = { guns: '}', shields: '{', eagles: '<' }
function setCardShadow(ctx: CanvasRenderingContext2D, height: number) {
  const scale = height / 1104
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
  ctx.shadowBlur = 2 * scale
  ctx.shadowOffsetX = scale
  ctx.shadowOffsetY = 2 * scale
}
function paintResources(ctx: CanvasRenderingContext2D, glyphs: string[], p: Placement, w: number, h: number) {
  const size = p.size * h / 100, count = glyphs.length
  const x = p.x * w / 100, y = p.y * h / 100
  ctx.font = `${size}px CardSymbols`; ctx.fillStyle = p.color
  for (const [i, glyph] of glyphs.entries()) {
    const top = y + i * size * p.lineHeight
    ctx.save(); ctx.beginPath(); ctx.rect(x + size * .08, top + size * .04, size * .82, size * .82); ctx.clip()
    ctx.fillText(glyph, x, top + size * .82); ctx.restore()
  }
  // The column sizes itself from icon size and spacing; only the card edge limits it.
  return count > 0 && (x < 0 || y < 0 || x + size > w || y + (count - 1) * size * p.lineHeight + size > h)
}
// The artwork scaled to cover its window and moved by the transform. It is the card's bottom layer and is not cut to
// the window: it runs on under the template, showing wherever the template is transparent.
function paintArtwork(ctx: CanvasRenderingContext2D, art: HTMLImageElement, win: { x: number; y: number; width: number; height: number }, w: number, h: number, artwork: ArtworkTransform) {
  const wx = win.x * w / 100, wy = win.y * h / 100, ww = win.width * w / 100, wh = win.height * h / 100
  const scale = Math.max(ww / art.naturalWidth, wh / art.naturalHeight) * artwork.scale
  const dw = art.naturalWidth * scale, dh = art.naturalHeight * scale
  const dx = wx + (ww - dw) / 2 + artwork.x * w / 100, dy = wy + (wh - dh) / 2 + artwork.y * h / 100
  const adjust = artwork.adjust
  if (isNeutralAdjust(adjust)) { ctx.drawImage(art, dx, dy, dw, dh); return }
  // Correct only what is on the card, not the whole (possibly huge) scaled image.
  const part = document.createElement('canvas'); part.width = w; part.height = h
  const pctx = part.getContext('2d', { willReadFrequently: true })
  if (!pctx) { ctx.drawImage(art, dx, dy, dw, dh); return }
  pctx.drawImage(art, dx, dy, dw, dh)
  const pixels = pctx.getImageData(0, 0, w, h)
  adjustPixels(pixels.data, w, h, adjust!)
  pctx.putImageData(pixels, 0, 0)
  ctx.drawImage(part, 0, 0)
}
// Layers, bottom first: the card's artwork (positioned by `artwork` inside
// ART_WINDOW), the faction template (generated image), overlays, panels, text.
// The artwork only shows where the template is transparent.
export type RenderInput = { card: CombatCard | FramedCard; layout: Layout; imageUrl: string; logoUrl?: string | null; logoScale?: number; artworkUrl?: string | null; artwork?: ArtworkTransform; eventElement?: EventElementInput; outputSize?: { width: number; height: number } }
export type RenderOutput = { canvas: HTMLCanvasElement; warnings: string[]; textPositions: { upper_text: Placement; lower_text: Placement } }
// Upgrade and event cards. Layers, bottom first: the card's artwork (events
// only, inside its window), then for events the chains, the faction template
// (generated or uploaded), for events the banners, then the icons and logo, and
// the text on top. The frame supplies the panels.
async function renderFramed({ card, layout, imageUrl, logoUrl, logoScale = 1, artworkUrl, artwork = defaultArtwork(), eventElement, outputSize }: RenderInput & { card: FramedCard }): Promise<RenderOutput> {
  const iconUrl = card.category === 'upgrade' ? ORDER_ICONS[card.upgrade_type] : ACTION_ICONS[card.action]
  const upgrade = card.category === 'upgrade'
  const event = card.category === 'schema'
  const [template, icon, logo, levelBadge, gear, art, chains, banners, element] = await Promise.all([loadImage(imageUrl), iconUrl ? loadImage(iconUrl) : null, logoUrl ? loadImage(logoUrl) : null, upgrade ? loadImage(BUNDLED_ICONS.tech) : null, upgrade ? loadImage(BUNDLED_ICONS.gear) : null, card.category === 'schema' && artworkUrl ? loadImage(artworkUrl) : null, event ? loadImage(eventChainsSrc) : null, event ? loadImage(eventBannersSrc) : null, event && eventElement ? keyedElement(eventElement.url) : null, loadFonts()])
  const w = outputSize?.width ?? template.naturalWidth
  const h = outputSize?.height ?? template.naturalHeight
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the card canvas.')
  if (art) paintArtwork(ctx, art, artWindow(card.category), w, h, artwork)
  const coverDraw = (image: HTMLImageElement) => {
    const cover = Math.max(w / image.naturalWidth, h / image.naturalHeight)
    ctx.drawImage(image, (w - image.naturalWidth * cover) / 2, (h - image.naturalHeight * cover) / 2, image.naturalWidth * cover, image.naturalHeight * cover)
  }
  if (chains) coverDraw(chains)
  coverDraw(template)
  if (banners) coverDraw(banners)
  // The faction's ornament on the strip under the tactic/scheme banner, over the banners and under the icons.
  if (element && eventElement) {
    const ew = w * eventElement.scale, eh = element.height * (ew / element.width)
    ctx.drawImage(element, w * (EVENT_ELEMENT_HOME.x + eventElement.x) - ew / 2, h * (EVENT_ELEMENT_HOME.y + eventElement.y) - eh / 2, ew, eh)
  }
  const colors = defaultLayout(card.category), warnings: string[] = []
  const texts: Partial<Record<typeof LAYERS[number], string>> = card.category === 'upgrade'
    ? { name: card.name.toUpperCase(), level: String(card.level), resource_cost: String(card.resource_cost), upper_text: card.text, limitation: card.limitation ?? '' }
    : { name: card.name.toUpperCase(), subtype: card.subtype === 'tactic' ? 'TACTIC' : 'SCHEME', upper_text: card.text }
  const fit = (image: HTMLImageElement, p: Placement, scale = 1) => {
    const bw = p.width * w / 100, bh = p.height * h / 100, f = Math.min(bw / image.naturalWidth, bh / image.naturalHeight) * scale
    ctx.drawImage(image, p.x * w / 100 + (bw - image.naturalWidth * f) / 2, p.y * h / 100 + (bh - image.naturalHeight * f) / 2, image.naturalWidth * f, image.naturalHeight * f)
  }
  // Icons and the logo go under the text.
  const isIcon = (layer: typeof LAYERS[number]) => layer === 'order_icon' || layer === 'level_icon' || layer === 'cost_icon' || layer === 'logo'
  const ordered = [...framedLayers(card.category)].sort((a, b) => Number(isIcon(b)) - Number(isIcon(a)))
  for (const layer of ordered) {
    const p = { ...layout[layer], color: colors[layer].color }
    if (layer === 'order_icon') { if (icon) fit(icon, p); continue }
    if (layer === 'level_icon' || layer === 'cost_icon') {
      const image = layer === 'level_icon' ? levelBadge : gear
      if (image) { ctx.save(); setCardShadow(ctx, h); fit(image, p); ctx.restore() }
      continue
    }
    if (layer === 'logo') {
      if (!logo) continue
      ctx.save(); setCardShadow(ctx, h); fit(logo, p, logoScale); ctx.restore(); continue
    }
    const shadowed = layer === 'resource_cost' || layer === 'level'
    if (shadowed) { ctx.save(); setCardShadow(ctx, h) }
    const overflow = paintText(ctx, texts[layer] ?? '', p, event && layer === 'subtype' ? 'CardEvent' : layer === 'upper_text' || layer === 'limitation' ? 'CardRules' : 'CardHeadline', w, h, layer === 'subtype' || layer === 'limitation' || (layer === 'name' && card.category === 'upgrade') ? 'center' : layer === 'level' || layer === 'resource_cost' ? 'digit' : 'left')
    if (shadowed) ctx.restore()
    if (overflow) warnings.push(`${layerLabel(layer, card.category)} extends beyond its box or the card. Move it, increase the box height, or reduce the font size.`)
  }
  return { canvas, warnings, textPositions: { upper_text: layout.upper_text, lower_text: layout.lower_text } }
}
export async function renderCard(input: RenderInput): Promise<RenderOutput> {
  if (input.card.category !== 'combat') return renderFramed({ ...input, card: input.card })
  return renderCombat({ ...input, card: input.card })
}
async function renderCombat({ card, layout, imageUrl, logoUrl, logoScale = 1, artworkUrl, artwork = defaultArtwork() }: RenderInput & { card: CombatCard }): Promise<RenderOutput> {
  // The ribbon for the card's type; its size is the finished card's.
  const [template, ribbon, levelBadge, gear, background, foreground, bottom, art, logo] = await Promise.all([loadImage(imageUrl), loadImage(combatRibbon(card)), card.starting ? null : loadImage(BUNDLED_ICONS.tech), card.starting ? null : loadImage(BUNDLED_ICONS.gear), loadImage(backgroundSrc), lowerText(card).trim() ? loadImage(foregroundSrc) : null, loadImage(bottomSrc), artworkUrl ? loadImage(artworkUrl) : null, card.starting && logoUrl ? loadImage(logoUrl) : null, loadFonts()])
  const w = ribbon.naturalWidth
  const h = ribbon.naturalHeight
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the card canvas.')
  if (art) paintArtwork(ctx, art, artWindow('combat'), w, h, artwork)
  const cover = Math.max(w / template.naturalWidth, h / template.naturalHeight)
  ctx.drawImage(template, (w - template.naturalWidth * cover) / 2, (h - template.naturalHeight * cover) / 2, template.naturalWidth * cover, template.naturalHeight * cover)
  // Fonts are fixed: headline for the title and numbers, rules font for text.
  const familyFor = (_p: Placement, layer: string) => layer === 'name' || layer === 'level' || layer === 'resource_cost' ? 'CardHeadline' : 'CardRules'
  const upperBlock = measureBlock(ctx, card.upper_text, layout.upper_text, familyFor(layout.upper_text, 'upper_text'), w, h)
  const lowerBlock = measureBlock(ctx, lowerText(card), layout.lower_text, familyFor(layout.lower_text, 'lower_text'), w, h)
  const bottomHeight = bottom.naturalHeight * w / bottom.naturalWidth
  // Images are 300 dpi with the card centred in them: the margin below the cut line is bleed.
  const bleedBottom = Math.max(0, (h - CARD_CUT_HEIGHT_MM / 25.4 * 300) / 2)
  const panels = combatPanels(w, h, bottomHeight,
    { text: card.upper_text, height: upperBlock.height, placement: layout.upper_text },
    { text: lowerText(card), height: lowerBlock.height, placement: layout.lower_text },
    textureInsets(w / background.naturalWidth, foreground ? w / foreground.naturalWidth : undefined), bleedBottom)
  // Preserve each texture's aspect ratio; extend it vertically only when text
  // needs more parchment than the source image supplies. The canvas crops it.
  if (panels.backgroundY !== null) ctx.drawImage(background, 0, panels.backgroundY, w, Math.max(background.naturalHeight * w / background.naturalWidth, h - panels.backgroundY))
  if (foreground && panels.foregroundY !== null) ctx.drawImage(foreground, 0, panels.foregroundY, w, Math.max(foreground.naturalHeight * w / foreground.naturalWidth, h - panels.foregroundY))
  // The ribbon and its icons are drawn over the text panels, whatever the panels' size or place.
  ctx.drawImage(ribbon, 0, 0, w, h)
  // The level badge and the resource gear, on the round badge and the plate of the ribbon (starting cards have the logo instead).
  for (const [image, p] of [[levelBadge, layout.level_icon], [gear, layout.cost_icon]] as const) {
    if (!image) continue
    const bw = p.width * w / 100, bh = p.height * h / 100, f = Math.min(bw / image.naturalWidth, bh / image.naturalHeight)
    ctx.save(); setCardShadow(ctx, h)
    ctx.drawImage(image, p.x * w / 100 + (bw - image.naturalWidth * f) / 2, p.y * h / 100 + (bh - image.naturalHeight * f) / 2, image.naturalWidth * f, image.naturalHeight * f); ctx.restore()
  }
  const textPositions = {
    upper_text: { ...layout.upper_text, y: panels.upperY / h * 100, height: Math.max(layout.upper_text.height, upperBlock.height / h * 100) },
    lower_text: { ...layout.lower_text, y: panels.lowerY / h * 100, height: Math.max(layout.lower_text.height, lowerBlock.height / h * 100) },
  }
  // Colours are fixed per layer, whatever an older saved layout says.
  const colors = defaultLayout()
  const paintLayout = Object.fromEntries(LAYERS.map(key => [key, { ...layout, ...textPositions }[key]]).map(([key, p]) => [key, { ...(p as Placement), color: colors[key as typeof LAYERS[number]].color }])) as Layout
  const texts = { name: card.name.toUpperCase(), level: String(card.level), resource_cost: String(card.resource_cost), upper_text: card.upper_text, lower_text: lowerText(card) }
  const warnings: string[] = []
  if (panels.overflow) warnings.push('Rules text extends beyond the parchment area. Reduce its size or adjust its position.')
  if (panels.overlap) warnings.push('Upper text overlaps the lower panel. Adjust the manual text positions.')
  for (const layer of LAYERS) {
    // Starting cards have no level requirement and no resource price; the
    // faction logo takes the level badge.
    if (layer === 'logo' || layer === 'order_icon' || layer === 'subtype' || layer === 'level_icon' || layer === 'cost_icon' || layer === 'limitation' || (card.starting && (layer === 'level' || layer === 'resource_cost'))) continue
    const p = paintLayout[layer]
    const family = familyFor(p, layer)
    const stack = RESOURCES.flatMap(r => Array.from({ length: card[r] }, () => PLAIN_GLYPHS[r]))
    const shadowed = layer === 'resources' || layer === 'resource_cost'
    if (shadowed) {
      ctx.save()
      setCardShadow(ctx, h)
    }
    const overflow = layer === 'resources'
      ? paintResources(ctx, stack, p, w, h)
      // A narrow level "1" is centred where a "2" would be, so it sits in the badge like one.
      : paintText(ctx, texts[layer], p, family, w, h, layer === 'level' || layer === 'resource_cost' ? 'digit' : 'left')
    if (shadowed) ctx.restore()
    if (overflow) warnings.push(`${LAYER_LABELS[layer]} extends beyond its box or the card. Move it, increase the box height, or reduce the font size.`)
  }
  if (bleedBottom > 0) {
    // Below the border (outside the cut) the bleed is a plain dark continuation
    // of the border's bottom edge colour, fading darker: clean, with nothing
    // to look stretched or smeared.
    const top = panels.bottomY + bottomHeight - 1
    const edge = edgeColor(bottom)
    const fade = ctx.createLinearGradient(0, top, 0, h)
    fade.addColorStop(0, edge); fade.addColorStop(1, shade(edge, 0.55))
    ctx.fillStyle = fade; ctx.fillRect(0, top, w, h - top)
  }
  ctx.drawImage(bottom, 0, panels.bottomY, w, bottomHeight)
  if (logo) {
    const box = layout.logo, bw = box.width * w / 100, bh = box.height * h / 100
    const fit = Math.min(bw / logo.naturalWidth, bh / logo.naturalHeight) * logoScale
    ctx.save()
    setCardShadow(ctx, h)
    ctx.drawImage(logo, box.x * w / 100 + (bw - logo.naturalWidth * fit) / 2, box.y * h / 100 + (bh - logo.naturalHeight * fit) / 2, logo.naturalWidth * fit, logo.naturalHeight * fit)
    ctx.restore()
  }
  return { canvas, warnings, textPositions }
}
export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'))
}
