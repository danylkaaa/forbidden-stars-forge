import { useEffect, useRef, type ComponentProps, type Ref } from 'react'

// A checkerboard under the card shows which areas are transparent (an empty artwork window, for one).
const CHECKERBOARD = 'bg-[repeating-conic-gradient(var(--color-accent-700)_0%_25%,var(--color-accent-900)_0%_50%)] bg-[length:20px_20px]'

// Copies a rendered card onto a visible canvas scaled down by CSS.
export function CardCanvas({ result, canvasRef, className, ...rest }: { result: { canvas: HTMLCanvasElement } | null; canvasRef?: Ref<HTMLCanvasElement> } & ComponentProps<'canvas'>) {
  const local = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = local.current
    if (!result || !canvas) return
    canvas.width = result.canvas.width; canvas.height = result.canvas.height
    canvas.getContext('2d')?.drawImage(result.canvas, 0, 0)
  }, [result])
  return <canvas {...rest} className={`${CHECKERBOARD} ${className ?? ''}`} ref={el => {
    local.current = el
    if (typeof canvasRef === 'function') canvasRef(el)
    else if (canvasRef) canvasRef.current = el
  }} />
}
