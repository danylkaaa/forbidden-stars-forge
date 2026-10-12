import { defaultArtwork, type ArtworkTransform } from './artwork'
import backgroundSrc from '../../images/combat/background.png?url'
import foregroundSrc from '../../images/combat/foreground.png?url'
import bottomSrc from '../../images/combat/bottom.png?url'
import { combatPanels } from './combatPanels'
import headline from '../../fonts/Headline.woff2?url'
import event from '../../fonts/EventFont.woff2?url'
import symbols from '../../fonts/ForbiddenStars.woff2?url'
import { LAYERS, LAYER_LABELS, textRuns, resourceToken, type CombatCard, type Layout, type Placement, type Run } from './model'

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
  if (run.unframed) {
    ctx.save(); ctx.beginPath(); ctx.rect(x + size * .08, baseline - size * .78, size * .82, size * .82); ctx.clip()
    ctx.fillText(run.text, x, baseline); ctx.restore()
  } else ctx.fillText(run.text, x, baseline)
}
function measureBlock(ctx: CanvasRenderingContext2D, text: string, p: Placement, family: string, w: number, h: number) {
  const size = p.size * h / 100
  const lineHeight = size * p.lineHeight
  const measure = (run: Run) => { ctx.font = font(run, size, family); return ctx.measureText(run.text).width }
  const lines = wrapText(textRuns(text), p.width * w / 100, measure)
  let ascent = 0, descent = 0
  for (const line of lines) {
    // Trailing spaces must not push a centered line away from its visual centre.
    while (line.length && /^\s+$/.test(line.at(-1)!.text)) line.pop()
    for (const atom of line) {
      if (!atom.text.trim()) continue
      ctx.font = font(atom, size, family)
      const metrics = ctx.measureText(atom.text)
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
    const lineWidth = line.reduce((total, atom) => total + atom.width, 0)
    let x = p.x * w / 100 + (p.align === 'center' ? (p.width * w / 100 - lineWidth) / 2 : p.align === 'right' ? p.width * w / 100 - lineWidth : 0)
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
function paintResources(ctx: CanvasRenderingContext2D, glyph: string, count: number, p: Placement, w: number, h: number) {
  const size = p.size * h / 100
  const x = p.x * w / 100, y = p.y * h / 100
  ctx.font = `${size}px CardSymbols`; ctx.fillStyle = p.color
  for (let i = 0; i < count; i++) {
    const top = y + i * size * p.lineHeight
    ctx.save(); ctx.beginPath(); ctx.rect(x + size * .08, top + size * .04, size * .82, size * .82); ctx.clip()
    ctx.fillText(glyph, x, top + size * .82); ctx.restore()
  }
  return count > 0 && ((count - 1) * size * p.lineHeight + size > p.height * h / 100 || size * .9 > p.width * w / 100 || x < 0 || y < 0 || x + size > w || y + (count - 1) * size * p.lineHeight + size > h)
}
export type RenderInput = { card: CombatCard; layout: Layout; imageUrl: string; overlayUrl: string | null; artwork?: ArtworkTransform; outputSize?: { width: number; height: number } }
export async function renderCard({ card, layout, imageUrl, overlayUrl, artwork = defaultArtwork(), outputSize }: RenderInput): Promise<{ canvas: HTMLCanvasElement; warnings: string[]; textPositions: { upper_text: Placement; lower_text: Placement } }> {
  const [art, overlay, background, foreground, bottom] = await Promise.all([loadImage(imageUrl), overlayUrl ? loadImage(overlayUrl) : null, loadImage(backgroundSrc), card.lower_text.trim() ? loadImage(foregroundSrc) : null, loadImage(bottomSrc), loadFonts()])
  // Overlay dimensions define the finished card when supplied.
  const w = overlay?.naturalWidth ?? outputSize?.width ?? art.naturalWidth
  const h = overlay?.naturalHeight ?? outputSize?.height ?? art.naturalHeight
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the card canvas.')
  const scale = Math.max(w / art.naturalWidth, h / art.naturalHeight) * artwork.scale
  ctx.drawImage(art, (w - art.naturalWidth * scale) / 2 + artwork.x * w / 100, (h - art.naturalHeight * scale) / 2 + artwork.y * h / 100, art.naturalWidth * scale, art.naturalHeight * scale)
  if (overlay) ctx.drawImage(overlay, 0, 0, w, h)
  const familyFor = (p: Placement, layer: string) => ({ rules: 'CardRules', event: 'CardEvent', headline: 'CardHeadline' }[p.font ?? (layer === 'name' || layer === 'level' || layer === 'resource_cost' ? 'headline' : 'rules')])
  const upperBlock = measureBlock(ctx, card.upper_text, layout.upper_text, familyFor(layout.upper_text, 'upper_text'), w, h)
  const lowerBlock = measureBlock(ctx, card.lower_text, layout.lower_text, familyFor(layout.lower_text, 'lower_text'), w, h)
  const bottomHeight = bottom.naturalHeight * w / bottom.naturalWidth
  const panels = combatPanels(w, h, bottomHeight,
    { text: card.upper_text, height: upperBlock.height, placement: layout.upper_text },
    { text: card.lower_text, height: lowerBlock.height, placement: layout.lower_text })
  // Preserve each texture's aspect ratio; extend it vertically only when text
  // needs more parchment than the source image supplies. The canvas crops it.
  if (panels.backgroundY !== null) ctx.drawImage(background, 0, panels.backgroundY, w, Math.max(background.naturalHeight * w / background.naturalWidth, h - panels.backgroundY))
  if (foreground && panels.foregroundY !== null) ctx.drawImage(foreground, 0, panels.foregroundY, w, Math.max(foreground.naturalHeight * w / foreground.naturalWidth, h - panels.foregroundY))
  const textPositions = {
    upper_text: { ...layout.upper_text, y: panels.upperY / h * 100, height: Math.max(layout.upper_text.height, upperBlock.height / h * 100) },
    lower_text: { ...layout.lower_text, y: panels.lowerY / h * 100, height: Math.max(layout.lower_text.height, lowerBlock.height / h * 100) },
  }
  const paintLayout = { ...layout, ...textPositions }
  const repeated = (token: string, n: number) => n <= 12 ? Array.from({ length: n }, () => token).join('\n') : `${token} × ${n}`
  const texts = { name: card.name.toUpperCase(), level: String(card.level), resource_cost: String(card.resource_cost), costIcon: '⚙',
    guns: repeated(`[${resourceToken('guns', layout.guns.iconStyle)}]`, card.guns), shields: repeated(`[${resourceToken('shields', layout.shields.iconStyle)}]`, card.shields), eagles: repeated(`[${resourceToken('eagles', layout.eagles.iconStyle)}]`, card.eagles), upper_text: card.upper_text, lower_text: card.lower_text }
  const warnings: string[] = []
  if (panels.overflow) warnings.push('Rules text extends beyond the parchment area. Reduce its size or adjust its position.')
  if (panels.overlap) warnings.push('Upper text overlaps the lower panel. Adjust the manual text positions.')
  for (const layer of LAYERS) {
    const p = paintLayout[layer]
    const family = familyFor(p, layer)
    const resource = layer === 'guns' || layer === 'shields' || layer === 'eagles' ? layer : null
    const overflow = resource && p.iconStyle === 'plain' && card[resource] <= 12
      ? paintResources(ctx, { guns: '}', shields: '{', eagles: '<' }[resource], card[resource], p, w, h)
      : paintText(ctx, texts[layer], p, family, w, h)
    if (overflow) warnings.push(`${LAYER_LABELS[layer]} extends beyond its box or the card. Move it, increase the box height, or reduce the font size.`)
  }
  ctx.drawImage(bottom, 0, panels.bottomY, w, bottomHeight)
  return { canvas, warnings, textPositions }
}
export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'))
}
