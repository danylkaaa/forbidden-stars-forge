import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { templateUrl, useCardTypes } from '../card-types/api'
import { DEFAULT_PLACEMENT, saveCharacterPlacement, type CharacterPlacement, type PlacementBox, type FactionCharacter } from './characters'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_BOX = 0.02

// What a drag changes: the picture, the box as a whole, or one or two of the box's edges.
type Grip = 'image' | 'box' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: { grip: Grip; style: React.CSSProperties; cursor: string }[] = [
  { grip: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' }, { grip: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { grip: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' }, { grip: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { grip: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' }, { grip: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { grip: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' }, { grip: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' },
]

// A box's edges moved by (dx, dy) for a grip, kept on the template and at least MIN_BOX in size.
function resized(b: PlacementBox, grip: Grip, dx: number, dy: number): PlacementBox {
  if (grip === 'box') return { ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) }
  let left = b.x, top = b.y, right = b.x + b.w, bottom = b.y + b.h
  if (grip.includes('w')) left = clamp(left + dx, 0, right - MIN_BOX)
  if (grip.includes('e')) right = clamp(right + dx, left + MIN_BOX, 1)
  if (grip.includes('n')) top = clamp(top + dy, 0, bottom - MIN_BOX)
  if (grip.includes('s')) bottom = clamp(bottom + dy, top + MIN_BOX, 1)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

// Where the faction's character is pasted on the faction card template sent to OpenAI. The dashed box is the
// canvas the picture is cut to: drag its handles to resize it, its top bar to move it. Drag the picture to move it,
// scroll to zoom. The server pastes it the same way.
export function CharacterPlacementDialog({ factionId, character, onClose }: { factionId: number; character: FactionCharacter; onClose: () => void }) {
  const queryClient = useQueryClient()
  const template = useCardTypes().data?.find((c) => c.name === 'faction card')
  const src = template ? templateUrl(template) : null
  const [place, setPlace] = useState<CharacterPlacement>({ ...DEFAULT_PLACEMENT, ...character.placement })
  const [ratio, setRatio] = useState(3040 / 1792)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ grip: Grip; x: number; y: number; start: CharacterPlacement } | null>(null)
  const save = useMutation({
    mutationFn: () => saveCharacterPlacement(factionId, place),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['faction-characters'] }); onClose() },
  })

  // Scrolling zooms the picture about its centre (a non-passive listener, so the page does not scroll).
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      setPlace((p) => ({ ...p, scale: clamp(p.scale * Math.exp(-e.deltaY * 0.0015), 0.05, 4) }))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [src])

  const start = (grip: Grip) => (e: React.PointerEvent) => {
    e.stopPropagation()
    drag.current = { grip, x: e.clientX, y: e.clientY, start: place }
    frame.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current, rect = frame.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = (e.clientX - d.x) / rect.width, dy = (e.clientY - d.y) / rect.height
    if (d.grip === 'image') setPlace({ ...d.start, x: clamp(d.start.x + dx, -1, 2), y: clamp(d.start.y + dy, -1, 2) })
    else setPlace({ ...d.start, box: resized(d.start.box, d.grip, dx, dy) })
  }

  const { box } = place
  const picture = (inBox: boolean): React.CSSProperties => inBox
    // Inside the box, positioned relative to it.
    ? { height: `${place.scale / box.h * 100}%`, left: `${(place.x - box.x) / box.w * 100}%`, top: `${(place.y - box.y) / box.h * 100}%`, transform: 'translate(-50%, -50%)' }
    : { height: `${place.scale * 100}%`, left: `${place.x * 100}%`, top: `${place.y * 100}%`, transform: 'translate(-50%, -50%)' }
  const slider = (label: string, value: number, min: number, max: number, set: (v: number) => void) => (
    <label className="flex items-center gap-2 text-xs text-ink/70">
      <span className="w-14">{label}</span>
      <input type="range" min={min} max={max} step={0.005} value={value} onChange={(e) => set(Number(e.target.value))} className="w-32 accent-[var(--color-accent)]" />
      <span className="w-10 tabular-nums">{Math.round(value * 100)}%</span>
    </label>
  )

  return <Dialog title="Character on the faction card template" width="min(1100px,100%)" layer="z-20" onBackdropClick={onClose}>
    <p className="m-0 text-xs text-ink/60">The dashed box is the canvas the picture is cut to: drag its handles to resize it, its top bar to move it. Drag the picture to move it, scroll to zoom. OpenAI gets the template with the picture pasted in the box.</p>
    {!src ? <p role="alert" className="m-0 text-sm text-danger">The faction card image type has no template yet. Upload one on Image Types first.</p> :
      <div ref={frame} className="relative w-full cursor-move touch-none select-none overflow-hidden rounded border border-divider bg-bg" style={{ aspectRatio: String(ratio) }}
        onPointerDown={start('image')} onPointerMove={move} onPointerUp={() => { drag.current = null }}>
        <img src={src} alt="Faction card template" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full"
          onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight) }} />
        {/* The part outside the box is shown faintly: it is cut off. */}
        <img src={character.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none opacity-25" style={picture(false)} />
        <div className="pointer-events-none absolute overflow-hidden" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
          <img src={character.url} alt="Faction character" draggable={false} className="absolute max-w-none" style={picture(true)} />
        </div>
        <div className="absolute border-2 border-dashed border-accent" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, pointerEvents: 'none' }}>
          <button type="button" aria-label="Move the box" onPointerDown={start('box')}
            className="pointer-events-auto absolute left-1/2 top-0 h-5 w-16 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-accent bg-surface text-[10px] text-accent">move</button>
          {HANDLES.map(({ grip, style, cursor }) => <span key={grip} aria-hidden="true" onPointerDown={start(grip)}
            className="pointer-events-auto absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-accent bg-surface" style={{ ...style, cursor }} />)}
        </div>
      </div>}
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {slider('Across', place.x, -0.5, 1.5, (x) => setPlace({ ...place, x }))}
      {slider('Down', place.y, -0.5, 1.5, (y) => setPlace({ ...place, y }))}
      {slider('Height', place.scale, 0.05, 2, (scale) => setPlace({ ...place, scale }))}
      <Button type="button" onClick={() => setPlace({ ...place, box: { x: 0, y: 0, w: 1, h: 1 } })}>Box: whole template</Button>
    </div>
    {save.error && <p role="alert" className="m-0 text-sm text-danger">{save.error instanceof Error ? save.error.message : 'Could not save the position.'}</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" onClick={() => setPlace(DEFAULT_PLACEMENT)}>Reset</Button>
      <Button type="button" onClick={onClose}>Cancel</Button>
      <Button variant="primary" type="button" disabled={save.isPending || !src} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save position'}</Button>
    </div>
  </Dialog>
}
