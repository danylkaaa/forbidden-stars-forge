// Small paragraph painter for the faction card: word wrap with bold runs,
// paragraphs split on newlines, optional shrink-to-fit.
export type Span = { text: string; bold?: boolean; italic?: boolean } // `italic` overrides the paragraph's style for this run
export type ParagraphStyle = { x: number; y: number; width: number; height?: number; size: number; lineHeight: number; color: string; family: string; italic?: boolean; align?: 'left' | 'center' | 'right'; paragraphGap?: number }

type Word = { text: string; bold: boolean; italic: boolean; width: number }
function layout(ctx: CanvasRenderingContext2D, spans: Span[], s: ParagraphStyle, size: number): { lines: Word[][]; paragraphBreaks: Set<number> } {
  const font = (bold: boolean, italic: boolean) => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${s.family}, CardEvent, serif`
  const lines: Word[][] = [[]], breaks = new Set<number>()
  let x = 0
  for (const span of spans) {
    const parts = span.text.split(/(\n|[^\S\n]+|\S+)/).filter(Boolean)
    for (const text of parts) {
      if (text === '\n') { lines.push([]); breaks.add(lines.length - 1); x = 0; continue }
      const italic = span.italic ?? !!s.italic
      ctx.font = font(!!span.bold, italic)
      const width = ctx.measureText(text).width, blank = !text.trim()
      if (blank && x === 0) continue
      if (x > 0 && x + width > s.width && !blank) { lines.push([]); x = 0 }
      lines.at(-1)!.push({ text, bold: !!span.bold, italic, width }); x += width
    }
  }
  for (const line of lines) while (line.length && !line.at(-1)!.text.trim()) line.pop()
  return { lines, paragraphBreaks: breaks }
}
const heightOf = (lineCount: number, breakCount: number, size: number, s: ParagraphStyle) => lineCount * size * s.lineHeight + breakCount * (s.paragraphGap ?? 0) * size

// Paints the spans, shrinking the font (down to 60%) until they fit `height`.
// Returns the font size used and whether the text still overflows.
export function paintParagraph(ctx: CanvasRenderingContext2D, spans: Span[], s: ParagraphStyle): { size: number; overflow: boolean } {
  let size = s.size, result = layout(ctx, spans, s, size)
  if (s.height) while (size > s.size * 0.6 && heightOf(result.lines.length, result.paragraphBreaks.size, size, s) > s.height) { size *= 0.96; result = layout(ctx, spans, s, size) }
  ctx.fillStyle = s.color; ctx.textBaseline = 'alphabetic'
  let y = s.y + size
  result.lines.forEach((line, i) => {
    if (result.paragraphBreaks.has(i)) y += (s.paragraphGap ?? 0) * size
    const total = line.reduce((sum, w) => sum + w.width, 0)
    let x = s.x + (s.align === 'center' ? (s.width - total) / 2 : s.align === 'right' ? s.width - total : 0)
    for (const w of line) {
      ctx.font = `${w.italic ? 'italic ' : ''}${w.bold ? 'bold ' : ''}${size}px ${s.family}, CardEvent, serif`
      ctx.fillText(w.text, x, y); x += w.width
    }
    y += size * s.lineHeight
  })
  return { size, overflow: !!s.height && heightOf(result.lines.length, result.paragraphBreaks.size, size, s) > s.height }
}

// The size paintParagraph would use for these spans and the height they then take (nothing is painted).
export function measureParagraph(ctx: CanvasRenderingContext2D, spans: Span[], s: ParagraphStyle): { size: number; height: number; overflow: boolean } {
  let size = s.size, result = layout(ctx, spans, s, size)
  if (s.height) while (size > s.size * 0.6 && heightOf(result.lines.length, result.paragraphBreaks.size, size, s) > s.height) { size *= 0.96; result = layout(ctx, spans, s, size) }
  const height = heightOf(result.lines.length, result.paragraphBreaks.size, size, s)
  return { size, height, overflow: !!s.height && height > s.height }
}
