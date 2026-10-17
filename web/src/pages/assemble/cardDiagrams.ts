import type { FramedCard } from './model'

// Pictures some cards draw at the end of their description. The painter works in the picture's own 936 × 206 units.
type Diagram = { width: number; height: number; paint: (ctx: CanvasRenderingContext2D, color: string) => void }

// "A | B" becomes "B | A", each turned upside down: two system tiles rotated about the boundary they share.
const WARP: Diagram = {
  width: 936, height: 206,
  paint(ctx, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 5; ctx.lineJoin = 'round'
    const tile = (x: number, letter: string, turned: boolean) => {
      ctx.strokeRect(x, 30, 140, 146)
      ctx.save(); ctx.translate(x + 70, 103); if (turned) ctx.rotate(Math.PI)
      // Centre the letter's ink, not its em box.
      ctx.font = 'bold 100px CardRules, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      const m = ctx.measureText(letter)
      ctx.fillText(letter, -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2)
      ctx.restore()
    }
    const bar = (x: number) => ctx.fillRect(x - 3, 4, 6, 198)
    tile(28, 'A', false); bar(195); tile(222, 'B', false)
    // The arrow.
    ctx.globalAlpha = 0.75
    ctx.beginPath(); ctx.moveTo(402, 82); ctx.lineTo(464, 82); ctx.lineTo(464, 52); ctx.lineTo(516, 103); ctx.lineTo(464, 154); ctx.lineTo(464, 124); ctx.lineTo(402, 124); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1
    tile(556, 'B', true); bar(725); tile(750, 'A', true)
  },
}

const BY_NAME: Record<string, Diagram> = { 'a trick of the warp': WARP }

export const diagramFor = (card: FramedCard): Diagram | undefined => card.category === 'schema' ? BY_NAME[card.name.trim().toLowerCase()] : undefined

// Draws the picture across the bottom of the description box, as wide as the box allows (and at most a third of its
// height). Returns the height it took, for the caller to check against the text.
export function paintDiagram(ctx: CanvasRenderingContext2D, diagram: Diagram, box: { x: number; y: number; width: number; height: number }, color: string) {
  const scale = Math.min(box.width / diagram.width, box.height / 3 / diagram.height)
  const width = diagram.width * scale, height = diagram.height * scale
  ctx.save(); ctx.translate(box.x + (box.width - width) / 2, box.y + box.height - height); ctx.scale(scale, scale)
  diagram.paint(ctx, color)
  ctx.restore()
  return height
}
