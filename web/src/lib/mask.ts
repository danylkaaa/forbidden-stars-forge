// Mask painting for area edits: strokes and the OpenAI mask export.

// One brush or eraser stroke, in the image's natural pixel coordinates.
export type Stroke = { erase: boolean; size: number; points: [number, number][] }

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], color: string) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = s.size
    const [first, ...rest] = s.points
    if (!first) continue
    if (rest.length === 0) {
      ctx.beginPath()
      ctx.arc(first[0], first[1], s.size / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    ctx.moveTo(first[0], first[1])
    for (const [x, y] of rest) ctx.lineTo(x, y)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}

// The OpenAI mask: same size as the image, opaque everywhere except the
// painted area, which is fully transparent ("edit here").
export function exportMask(width: number, height: number, strokes: Stroke[]): string {
  const paint = document.createElement('canvas')
  paint.width = width
  paint.height = height
  const pctx = paint.getContext('2d')
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const mctx = mask.getContext('2d')
  if (!pctx || !mctx) throw new Error('canvas unavailable')
  drawStrokes(pctx, strokes, '#000')
  mctx.fillStyle = '#000'
  mctx.fillRect(0, 0, width, height)
  mctx.globalCompositeOperation = 'destination-out'
  mctx.drawImage(paint, 0, 0)
  return mask.toDataURL('image/png')
}
