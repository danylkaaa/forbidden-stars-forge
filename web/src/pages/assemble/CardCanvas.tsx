import { useEffect, useRef, type ComponentProps, type Ref } from 'react'
import type { RenderResult } from './useCardView'

// Copies a rendered card onto a visible canvas scaled down by CSS.
export function CardCanvas({ result, canvasRef, ...rest }: { result: RenderResult | null; canvasRef?: Ref<HTMLCanvasElement> } & ComponentProps<'canvas'>) {
  const local = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = local.current
    if (!result || !canvas) return
    canvas.width = result.canvas.width; canvas.height = result.canvas.height
    canvas.getContext('2d')?.drawImage(result.canvas, 0, 0)
  }, [result])
  return <canvas {...rest} ref={el => {
    local.current = el
    if (typeof canvasRef === 'function') canvasRef(el)
    else if (canvasRef) canvasRef.current = el
  }} />
}
