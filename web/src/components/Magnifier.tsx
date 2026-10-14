import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// A round loupe that follows the pointer over the first image inside, showing
// it `zoom` times larger.
export function Magnifier({ children, zoom = 3, size = 160, className = '' }: { children: ReactNode; zoom?: number; size?: number; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const [lens, setLens] = useState<{ x: number; y: number; fx: number; fy: number; src: string; w: number; h: number } | null>(null)
  const track = (e: React.PointerEvent) => {
    const box = root.current?.getBoundingClientRect(), src = root.current?.querySelector('img')?.currentSrc
    if (!box?.width || !box.height || !src || e.pointerType === 'touch') { setLens(null); return }
    setLens({ x: e.clientX, y: e.clientY, fx: (e.clientX - box.left) / box.width, fy: (e.clientY - box.top) / box.height, src, w: box.width, h: box.height })
  }
  return <div ref={root} className={`cursor-zoom-in ${className}`} onPointerMove={track} onPointerEnter={track} onPointerLeave={() => setLens(null)}>
    {children}
    {lens && createPortal(<div aria-hidden="true" className="pointer-events-none fixed z-[100] rounded-full border-2 border-accent bg-black shadow-[0_6px_24px_rgba(0,0,0,0.7)]"
      style={{ width: size, height: size, left: lens.x - size / 2, top: lens.y - size - 16, backgroundImage: `url(${lens.src})`, backgroundRepeat: 'no-repeat',
        backgroundSize: `${lens.w * zoom}px ${lens.h * zoom}px`, backgroundPosition: `${size / 2 - lens.fx * lens.w * zoom}px ${size / 2 - lens.fy * lens.h * zoom}px` }} />, document.body)}
  </div>
}
