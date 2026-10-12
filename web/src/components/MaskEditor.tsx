import { useCallback, useEffect, useRef } from 'react'
import { drawStrokes, type Stroke } from '../lib/mask'

// Paint layer over an image (fills its positioned parent). Strokes are
// kept as data so undo/clear just redraw.
export function MaskEditor({
  width, height, strokes, onStroke, erase, brushSize,
}: {
  width: number
  height: number
  strokes: Stroke[]
  onStroke: (s: Stroke) => void
  erase: boolean
  brushSize: number // natural px
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const current = useRef<Stroke | null>(null)

  const redraw = useCallback((extra?: Stroke) => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    drawStrokes(ctx, extra ? [...strokes, extra] : strokes, '#ff3040')
  }, [strokes])

  useEffect(() => redraw(), [redraw, width, height])

  const toImage = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) * width) / (r.width || 1), ((e.clientY - r.top) * height) / (r.height || 1)]
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      data-testid="mask-canvas"
      className="absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-50"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        current.current = { erase, size: brushSize, points: [toImage(e)] }
        redraw(current.current)
      }}
      onPointerMove={(e) => {
        if (!current.current) return
        current.current.points.push(toImage(e))
        redraw(current.current)
      }}
      onPointerUp={() => {
        if (current.current) onStroke(current.current)
        current.current = null
      }}
      onPointerLeave={() => {
        if (current.current) onStroke(current.current)
        current.current = null
      }}
    />
  )
}
