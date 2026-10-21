import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MagnifierIcon } from '../../components/icons'

const LENS = 240, ZOOM = 3

// The loupe stays on until the next click (which it swallows, so nothing under it fires) or Esc.
export function useMagnifier() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!on) return
    const off = () => setOn(false)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') off() }
    const click = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest('[data-magnifier-toggle]')) { e.preventDefault(); e.stopPropagation(); off() } }
    window.addEventListener('keydown', key); window.addEventListener('click', click, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('click', click, true) }
  }, [on])
  return [on, setOn] as const
}
export function MagnifierButton({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return <button type="button" data-magnifier-toggle aria-pressed={on} disabled={disabled} onClick={onToggle}
    title={on ? 'Click anywhere or press Esc to stop' : 'Magnify the preview until the next click or Esc'}
    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 ${on ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`}>
    <MagnifierIcon />Magnifier
  </button>
}

// While `on`, a round loupe follows the pointer over the children and shows the rendered card under it `ZOOM` times larger.
export function CardLens({ on, source, children }: { on: boolean; source: HTMLCanvasElement | null; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null), lens = useRef<HTMLCanvasElement>(null)
  const [at, setAt] = useState<{ x: number; y: number; fx: number; fy: number; w: number } | null>(null)
  const track = (e: React.PointerEvent) => {
    const box = root.current?.getBoundingClientRect()
    if (!on || !source || !box?.width || !box.height || e.pointerType === 'touch') { setAt(null); return }
    setAt({ x: e.clientX, y: e.clientY, fx: (e.clientX - box.left) / box.width, fy: (e.clientY - box.top) / box.height, w: box.width })
  }
  useEffect(() => { if (!on) setAt(null) }, [on])
  useEffect(() => {
    const ctx = lens.current?.getContext('2d')
    if (!at || !source || !ctx) return
    // The lens shows LENS / ZOOM screen pixels of the card; that many card pixels at the source's resolution.
    const side = LENS / ZOOM * source.width / at.w
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, LENS, LENS)
    ctx.drawImage(source, at.fx * source.width - side / 2, at.fy * source.height - side / 2, side, side, 0, 0, LENS, LENS)
  }, [at, source])
  return <div ref={root} className={on ? 'cursor-zoom-in' : undefined} onPointerMove={track} onPointerEnter={track} onPointerLeave={() => setAt(null)}>
    {children}
    {at && createPortal(<canvas ref={lens} width={LENS} height={LENS} aria-hidden="true" className="pointer-events-none fixed z-[100] rounded-full border-2 border-accent bg-black shadow-[0_6px_24px_rgba(0,0,0,0.7)]"
      style={{ width: LENS, height: LENS, left: at.x - LENS / 2, top: at.y - LENS - 16 }} />, document.body)}
  </div>
}
