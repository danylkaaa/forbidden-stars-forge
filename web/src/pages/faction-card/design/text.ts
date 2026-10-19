// Text placed the way CSS places it: a line box of a given height, the glyphs centred in it by
// the font's own ascent and descent. This keeps the card's numbers and names where the design put them.
import type { Ctx } from './paint'

export type FontStyle = { family?: string; italic?: boolean; bold?: boolean }
export type LineStyle = FontStyle & { color: string; align?: CanvasTextAlign; squeeze?: number }
export const fontOf = (size: number, s: FontStyle = {}) => `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${size}px ${s.family ?? 'CardHeadline'}, CardEvent, serif`

// Draws one line whose line box starts at `top` and is `lineHeight` tall.
export function cssLine(ctx: Ctx, text: string, x: number, top: number, size: number, lineHeight: number, s: LineStyle) {
  ctx.save(); ctx.font = fontOf(size, s)
  const m = ctx.measureText('Mg'), ascent = m.fontBoundingBoxAscent ?? size * .8, descent = m.fontBoundingBoxDescent ?? size * .2
  // lineHeight 0 means CSS's `normal`: the line box is exactly as tall as the font's ascent plus descent.
  const box = lineHeight > 0 ? lineHeight : ascent + descent, baseline = top + (box - (ascent + descent)) / 2 + ascent
  ctx.fillStyle = s.color; ctx.textAlign = s.align ?? 'left'; ctx.textBaseline = 'alphabetic'
  ctx.translate(x, baseline)
  if (s.squeeze && s.squeeze !== 1) ctx.scale(s.squeeze, 1)
  ctx.fillText(text, 0, 0); ctx.restore()
}
// A line centred vertically in a box of height `h` starting at `top` (flex align-items: center).
export function centeredLine(ctx: Ctx, text: string, x: number, top: number, h: number, size: number, lineHeight: number, s: LineStyle) {
  cssLine(ctx, text, x, top + (h - lineHeight) / 2, size, lineHeight, s)
}
export function textWidth(ctx: Ctx, text: string, size: number, s: FontStyle = {}) {
  ctx.save(); ctx.font = fontOf(size, s); const w = ctx.measureText(text).width; ctx.restore()
  return w
}
// The largest size (down to `min`) at which the text fits `width` on one line.
export function fitFont(ctx: Ctx, text: string, width: number, max: number, min = 10, s: FontStyle = {}): { size: number; fits: boolean } {
  let size = max
  while (size > min && textWidth(ctx, text, size, s) > width) size -= 1
  return { size, fits: textWidth(ctx, text, size, s) <= width }
}
// A line centred in a box whose line height is `normal`, with extra padding above (CSS `padding-top`).
export function centerNormal(ctx: Ctx, text: string, x: number, top: number, h: number, size: number, s: LineStyle, paddingTop = 0) {
  ctx.save(); ctx.font = fontOf(size, s)
  const m = ctx.measureText('Mg'), box = (m.fontBoundingBoxAscent ?? size * .8) + (m.fontBoundingBoxDescent ?? size * .2)
  ctx.restore()
  cssLine(ctx, text, x, top + paddingTop + (h - paddingTop - box) / 2, size, 0, s)
}
