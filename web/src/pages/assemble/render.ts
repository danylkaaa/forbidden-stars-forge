import { defaultArtwork, type ArtworkTransform } from './artwork'
import backgroundSrc from '../../images/combat/background.png?url'
import foregroundSrc from '../../images/combat/foreground.png?url'
import bottomSrc from '../../images/combat/bottom.png?url'
import { combatPanels } from './combatPanels'
import headline from '../../fonts/Headline.woff2?url'
import event from '../../fonts/EventFont.woff2?url'
import symbols from '../../fonts/ForbiddenStars.woff2?url'
import { ART_WINDOW, LAYERS, LAYER_LABELS, defaultLayout, textRuns, type CombatCard, type Layout, type Placement, type Run } from './model'

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
function loadImage(url: string) {
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
function font(run: Run, size: number, family: string) { return `${run.italic ? 'italic ' : ''}${size}px ${run.icon ? 'CardSymbols' : family}, CardEvent, serif` }
// Measure the same runs we paint: symbols occupy one glyph and stay intact
// during wrapping. Newlines and long words are supported without squeezing.
export function wrapText(runs: Run[], maxWidth: number, measure: (run: Run) => number): Atom[][] {
  const lines: Atom[][] = [[]]
  let width = 0
  const newline = () => { lines.push([]); width = 0 }
  for (const run of runs) {
    const parts = run.icon ? [run.text] : run.text.split(/(\n|[^\S\n]+|[^\s]+)/g).filter(Boolean)
    for (const text of parts) {
      if (text === '\n') { newline(); continue }
      const word = { ...run, text }
      const wordWidth = measure(word)
      if (/^\s+$/.test(text) && width === 0) continue
      if (width > 0 && width + wordWidth > maxWidth) {
        newline()
        if (/^\s+$/.test(text)) continue
      }
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
function measureBlock(ctx: CanvasRenderingContext2D, text: string, p: Placement, family: string, w: number, h: number) {
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
  const height = text.trim() ? (lines.length - 1) * lineHeight + ascent + descent : 0
  return { size, lineHeight, lines, ascent, height }
}
function paintText(ctx: CanvasRenderingContext2D, text: string, p: Placement, family: string, w: number, h: number): boolean {
  const { size, lineHeight, lines, ascent, height: textHeight } = measureBlock(ctx, text, p, family, w, h)
  ctx.fillStyle = p.color
  // Centre visible glyph bounds, including inline icons, rather than the font's em box.
  const top = p.y * h / 100 + (p.verticalAlign === 'center' ? Math.max(0, (p.height * h / 100 - textHeight) / 2) : 0)
  for (const [i, line] of lines.entries()) {
    let x = p.x * w / 100
    for (const atom of line) {
      ctx.font = font(atom, size, family)
      paintRun(ctx, atom, x, top + ascent + i * lineHeight, size)
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
function textureInsets(scale: number) {
  return { background: 21 * scale, dividerTop: 6 * scale, foreground: 18 * scale }
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
// Layers, bottom first: the card's artwork (positioned by `artwork` inside
// ART_WINDOW), the faction template (generated image), overlays, panels, text.
// The artwork only shows where the template is transparent.
export type RenderInput = { card: CombatCard; layout: Layout; imageUrl: string; overlayUrl: string | null; overlayUrls?: string[]; logoUrl?: string | null; logoScale?: number; artworkUrl?: string | null; artwork?: ArtworkTransform; outputSize?: { width: number; height: number } }
export async function renderCard({ card, layout, imageUrl, overlayUrl, overlayUrls, logoUrl, logoScale = 1, artworkUrl, artwork = defaultArtwork(), outputSize }: RenderInput): Promise<{ canvas: HTMLCanvasElement; warnings: string[]; textPositions: { upper_text: Placement; lower_text: Placement } }> {
  // A subtype's overlay stack (bottom first) replaces the card type overlay.
  const stack = overlayUrls?.length ? overlayUrls : overlayUrl ? [overlayUrl] : []
  const [template, overlays, background, foreground, bottom, art, logo] = await Promise.all([loadImage(imageUrl), Promise.all(stack.map(loadImage)), loadImage(backgroundSrc), card.lower_text.trim() ? loadImage(foregroundSrc) : null, loadImage(bottomSrc), artworkUrl ? loadImage(artworkUrl) : null, card.level === 0 && logoUrl ? loadImage(logoUrl) : null, loadFonts()])
  // Overlay dimensions define the finished card when supplied.
  const overlay = overlays[0]
  const w = overlay?.naturalWidth ?? outputSize?.width ?? template.naturalWidth
  const h = overlay?.naturalHeight ?? outputSize?.height ?? template.naturalHeight
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the card canvas.')
  if (art) {
    const wx = ART_WINDOW.x * w / 100, wy = ART_WINDOW.y * h / 100, ww = ART_WINDOW.width * w / 100, wh = ART_WINDOW.height * h / 100
    const scale = Math.max(ww / art.naturalWidth, wh / art.naturalHeight) * artwork.scale
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip()
    ctx.drawImage(art, wx + (ww - art.naturalWidth * scale) / 2 + artwork.x * w / 100, wy + (wh - art.naturalHeight * scale) / 2 + artwork.y * h / 100, art.naturalWidth * scale, art.naturalHeight * scale)
    ctx.restore()
  }
  const cover = Math.max(w / template.naturalWidth, h / template.naturalHeight)
  ctx.drawImage(template, (w - template.naturalWidth * cover) / 2, (h - template.naturalHeight * cover) / 2, template.naturalWidth * cover, template.naturalHeight * cover)
  for (const layer of overlays) ctx.drawImage(layer, 0, 0, w, h)
  // Fonts are fixed: headline for the title and numbers, rules font for text.
  const familyFor = (_p: Placement, layer: string) => layer === 'name' || layer === 'level' || layer === 'resource_cost' ? 'CardHeadline' : 'CardRules'
  const upperBlock = measureBlock(ctx, card.upper_text, layout.upper_text, familyFor(layout.upper_text, 'upper_text'), w, h)
  const lowerBlock = measureBlock(ctx, card.lower_text, layout.lower_text, familyFor(layout.lower_text, 'lower_text'), w, h)
  const bottomHeight = bottom.naturalHeight * w / bottom.naturalWidth
  const panels = combatPanels(w, h, bottomHeight,
    { text: card.upper_text, height: upperBlock.height, placement: layout.upper_text },
    { text: card.lower_text, height: lowerBlock.height, placement: layout.lower_text },
    textureInsets(w / background.naturalWidth))
  // Preserve each texture's aspect ratio; extend it vertically only when text
  // needs more parchment than the source image supplies. The canvas crops it.
  if (panels.backgroundY !== null) ctx.drawImage(background, 0, panels.backgroundY, w, Math.max(background.naturalHeight * w / background.naturalWidth, h - panels.backgroundY))
  if (foreground && panels.foregroundY !== null) ctx.drawImage(foreground, 0, panels.foregroundY, w, Math.max(foreground.naturalHeight * w / foreground.naturalWidth, h - panels.foregroundY))
  const textPositions = {
    upper_text: { ...layout.upper_text, y: panels.upperY / h * 100, height: Math.max(layout.upper_text.height, upperBlock.height / h * 100) },
    lower_text: { ...layout.lower_text, y: panels.lowerY / h * 100, height: Math.max(layout.lower_text.height, lowerBlock.height / h * 100) },
  }
  // Colours are fixed per layer, whatever an older saved layout says.
  const colors = defaultLayout()
  const paintLayout = Object.fromEntries(LAYERS.map(key => [key, { ...layout, ...textPositions }[key]]).map(([key, p]) => [key, { ...(p as Placement), color: colors[key as typeof LAYERS[number]].color }])) as Layout
  const texts = { name: card.name.toUpperCase(), level: String(card.level), resource_cost: String(card.resource_cost), upper_text: card.upper_text, lower_text: card.lower_text }
  const warnings: string[] = []
  if (panels.overflow) warnings.push('Rules text extends beyond the parchment area. Reduce its size or adjust its position.')
  if (panels.overlap) warnings.push('Upper text overlaps the lower panel. Adjust the manual text positions.')
  for (const layer of LAYERS) {
    // Level 0 cards have no level requirement and no resource price; the
    // faction logo takes the level badge.
    if (layer === 'logo' || (card.level === 0 && (layer === 'level' || layer === 'resource_cost'))) continue
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
      : paintText(ctx, texts[layer], p, family, w, h)
    if (shadowed) ctx.restore()
    if (overflow) warnings.push(`${LAYER_LABELS[layer]} extends beyond its box or the card. Move it, increase the box height, or reduce the font size.`)
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
