import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/Button'
import { CubeIcon } from '../../components/icons'
import { BackImage } from './BackImage'
import type { Category } from '../cards/model'

type Rotation = { x: number; y: number }
const START: Rotation = { x: -8, y: -22 }

// A physical-looking card: front and back images on a rotating plane. Drag
// to turn it (it keeps spinning briefly when let go), scroll to zoom.
export function Card3DViewer({ title, front, back, backLogoUrl, backLogoScale, backElementUrl, category, factionId, initialSide = 'front', controls, onClose }: { category?: Category; factionId?: number; title: string; front: string | null; back: string | null; backLogoUrl?: string; backLogoScale?: number; backElementUrl?: string; initialSide?: 'front' | 'back'; controls?: ReactNode; onClose: () => void }) {
  const initialRotation = { ...START, y: START.y + (initialSide === 'back' ? 180 : 0) }
  const [rotation, setRotation] = useState<Rotation>(initialRotation)
  const [zoom, setZoom] = useState(1)
  const logoScale = backLogoScale ?? 0.5
  const [animate, setAnimate] = useState(false)
  const drag = useRef<{ x: number; y: number; t: number; vx: number; vy: number } | null>(null)
  const spin = useRef(0)
  const scene = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); cancelAnimationFrame(spin.current) }
  }, [onClose])
  useEffect(() => {
    const el = scene.current
    if (!el) return
    const wheel = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.min(1.8, Math.max(.5, z * Math.exp(-e.deltaY * .0015)))) }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  function glide(vx: number, vy: number) {
    cancelAnimationFrame(spin.current)
    const step = () => {
      vx *= .94; vy *= .94
      if (Math.abs(vx) < .02 && Math.abs(vy) < .02) return
      setRotation(r => ({ x: r.x + vy, y: r.y + vx }))
      spin.current = requestAnimationFrame(step)
    }
    spin.current = requestAnimationFrame(step)
  }
  const turn = (to: Rotation) => { cancelAnimationFrame(spin.current); setAnimate(true); setRotation(to) }

  // Light follows the card's tilt so the surface reads as glossy card stock.
  const shine = `linear-gradient(${105 + rotation.y * .6}deg, rgba(255,255,255,0) 30%, rgba(255,255,255,${.1 + Math.abs(Math.sin(rotation.y * Math.PI / 180)) * .12}) 50%, rgba(255,255,255,0) 70%)`
  const face = 'absolute inset-0 overflow-hidden rounded-[3.5%] [backface-visibility:hidden] shadow-[0_0_0_1px_rgba(0,0,0,0.6)]'
  return createPortal(<div role="dialog" aria-label={`3D preview of ${title}`} className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 p-4 backdrop-blur-sm"
    onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="flex w-full max-w-3xl items-center justify-between gap-3">
      <h2 className="m-0 truncate font-display text-xl text-accent-300">{title}</h2>
      <div className="flex gap-2">
        <Button onClick={() => turn({ x: 0, y: Math.round((rotation.y + 180) / 180) * 180 })}>Flip</Button>
        <Button onClick={() => { turn(initialRotation); setZoom(1) }}>Reset</Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
    {controls && <div className="w-full max-w-3xl">{controls}</div>}
    <div ref={scene} className="flex min-h-0 w-full flex-1 cursor-grab touch-none select-none items-center justify-center [perspective:1800px] active:cursor-grabbing"
      onPointerDown={e => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        cancelAnimationFrame(spin.current); setAnimate(false)
        drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), vx: 0, vy: 0 }
      }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x, dy = e.clientY - d.y, now = performance.now(), dt = Math.max(1, now - d.t)
        setRotation(r => ({ x: Math.max(-85, Math.min(85, r.x - dy * .4)), y: r.y + dx * .4 }))
        drag.current = { x: e.clientX, y: e.clientY, t: now, vx: dx * .4 * 16 / dt, vy: -dy * .4 * 16 / dt }
      }}
      onPointerUp={() => { const d = drag.current; drag.current = null; if (d) glide(d.vx, d.vy) }}
      onPointerCancel={() => { drag.current = null }}>
      <div data-testid="card-3d" className="relative aspect-[816/1104] h-[min(78vh,calc(90vw*1104/816))] [transform-style:preserve-3d]"
        style={{ transform: `scale(${zoom}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`, transition: animate ? 'transform .6s cubic-bezier(.2,.8,.2,1)' : undefined }}
        onTransitionEnd={() => setAnimate(false)}>
        <div className={face}>
          {front
            ? <img src={front} alt={`${title} front`} draggable={false} className="h-full w-full object-cover" />
            : <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle,#3a2a20,#120c09)] p-6 text-center text-sm text-ink/60">No card front chosen for this faction and type yet.</div>}
          <div aria-hidden="true" className="absolute inset-0" style={{ background: shine }} />
        </div>
        <div className={`${face} [transform:rotateY(180deg)]`}>
          {back
            ? <BackImage category={category} factionId={factionId} url={back} logoUrl={backLogoUrl} scale={controls ? backLogoScale : logoScale} elementUrl={backElementUrl} alt={`${title} back`} />
            : <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle,#3a2a20,#120c09)] p-6 text-center text-sm text-ink/60">No card back chosen for this faction and type yet.</div>}
          <div aria-hidden="true" className="absolute inset-0" style={{ background: shine }} />
        </div>
      </div>
    </div>
    <p className="m-0 text-xs text-ink/50">Drag to turn · scroll to zoom · Esc to close</p>
  </div>, document.body)
}

// Opens the card in the 3D viewer: the rendered front and the deck's back.
export function Preview3DButton({ title, canvas, back, backLogoUrl, backLogoScale, backElementUrl, category, factionId, className = '' }: { category?: Category; factionId?: number; title: string; canvas: HTMLCanvasElement | null; back: string | null; backLogoUrl?: string; backLogoScale?: number; backElementUrl?: string; className?: string }) {
  const [front, setFront] = useState<string | null>(null)
  return <>
    <button type="button" aria-label={`3D preview of ${title}`} title="3D preview" disabled={!canvas}
      onClick={() => { if (canvas) setFront(canvas.toDataURL('image/png')) }}
      className={`grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-white/20 bg-black/60 text-ink/85 shadow backdrop-blur-sm hover:border-accent hover:text-accent disabled:hidden ${className}`}>
      <CubeIcon />
    </button>
    {front && <Card3DViewer category={category} factionId={factionId} title={title} front={front} back={back} backLogoUrl={backLogoUrl} backLogoScale={backLogoScale} backElementUrl={backElementUrl} onClose={() => setFront(null)} />}
  </>
}
