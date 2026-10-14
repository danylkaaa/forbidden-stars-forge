import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { deleteAsset, uploadAsset } from './api'
import { DEFAULT_ORIENTATION, assetKeys, withDefaults, type ModelStyle, type Orientation, type SlotKey } from './model'
import { renderModelIcon } from './stl'

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits
type Slider = readonly [keyof Orientation, string, number, number, number]
// Pose, light and shadow settings, grouped in accordions.
// Shadow and outline are not here: they are shared by the whole faction card.
const GROUPS: { title: string; open?: boolean; sliders: Slider[] }[] = [
  { title: 'Position', open: true, sliders: [['rx', 'Tilt (X)', -180, 180, 1], ['ry', 'Turn (Y)', -180, 180, 1], ['rz', 'Roll (Z)', -180, 180, 1], ['scale', 'Size', 0.3, 3, 0.01], ['x', 'Shift left/right', -0.5, 0.5, 0.01], ['y', 'Shift up/down', -0.5, 0.5, 0.01]] },
  { title: 'Light', sliders: [['lightAzimuth', 'Light direction', -180, 180, 1], ['lightElevation', 'Light height', 0, 90, 1], ['lightPower', 'Light strength', 0.3, 5, 0.05], ['lightAmbient', 'Ambient light', 0, 1, 0.01], ['relief', 'Relief boost', 0, 4, 0.05], ['detail', 'Detail lines', 0, 1, 0.01]] },
]

// Upload a unit's STL, pose it (drag the preview to turn it, wheel to resize)
// and see exactly the icon the card will use. A PNG can replace the model.
export function UnitModelEditor({ factionId, slot, label, stlUrl, iconUrl, orientation, color, style, onChange }: {
  style: ModelStyle
  factionId: number; slot: SlotKey; label: string; stlUrl?: string; iconUrl?: string; orientation: Partial<Orientation> | undefined; color: string
  onChange: (o: Orientation) => void
}) {
  const queryClient = useQueryClient()
  // The pose being edited lives here and is rendered immediately; the card
  // (and its previews) only get it once the movement settles.
  const committed = useMemo(() => withDefaults(orientation), [orientation])
  const [o, setPose] = useState(committed)
  const settle = useRef<number | undefined>(undefined)
  const latest = useRef(onChange); latest.current = onChange
  const lastCommitted = useRef(committed)
  useEffect(() => { if (committed !== lastCommitted.current) { lastCommitted.current = committed; setPose(committed) } }, [committed])
  const pending = useRef<Orientation | null>(null)
  const flush = () => { window.clearTimeout(settle.current); const next = pending.current; pending.current = null; if (next) { lastCommitted.current = next; latest.current(next) } }
  const change = (next: Orientation) => { setPose(next); pending.current = next; window.clearTimeout(settle.current); settle.current = window.setTimeout(flush, 250) }
  // Closing the popup right after a move must not lose it.
  useEffect(() => flush, [])
  const canvas = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['faction-card', factionId] })
  const upload = useMutation({ mutationFn: ({ key, file }: { key: string; file: File }) => uploadAsset(factionId, key, file), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (key: string) => deleteAsset(factionId, key), onSuccess: refresh })
  useEffect(() => {
    const target = canvas.current
    if (!stlUrl || !target) return
    let cancelled = false
    const frame = requestAnimationFrame(() => renderModelIcon(stlUrl, { ...o, ...style }, color, 256).then(icon => {
      if (cancelled) return
      setError(''); target.width = icon.width; target.height = icon.height
      target.getContext('2d')?.drawImage(icon, 0, 0)
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render the model.') }))
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [stlUrl, o, color, style])
  const drag = useRef<{ x: number; y: number; start: Orientation } | null>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const wheel = (e: WheelEvent) => { e.preventDefault(); change({ ...o, scale: round(Math.min(3, Math.max(0.3, o.scale * Math.exp(-e.deltaY * .001)))) }) }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })
  const pick = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) upload.mutate({ key, file }); e.target.value = '' }
  const busy = upload.isPending || remove.isPending
  const failure = upload.error ?? remove.error
  const fileButton = 'inline-flex cursor-pointer items-center rounded-md border border-divider px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:border-accent/60'
  return <div className="flex flex-wrap gap-4 border-t border-divider pt-3">
    <div className="w-48 shrink-0 space-y-2">
      <div className="grid aspect-square place-items-center rounded border border-divider bg-black/30 text-xs text-ink/50">
        {iconUrl ? <img src={iconUrl} alt={`${label} icon`} className="max-h-full max-w-full object-contain" />
          : stlUrl ? <canvas ref={canvas} aria-label={`${label} model preview`} className="h-full w-full cursor-grab touch-none"
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, start: o } }}
            onPointerMove={e => { const d = drag.current; if (d) change({ ...d.start, ry: round(((d.start.ry + (e.clientX - d.x) * .8 + 540) % 360) - 180, 0), rx: round(Math.max(-180, Math.min(180, d.start.rx + (e.clientY - d.y) * .8)), 0) }) }}
            onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} />
          : 'No model'}
      </div>
      {error && <p role="alert" className="m-0 text-xs text-danger">{error}</p>}
    </div>
    <div className="min-w-64 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <label className={`${fileButton} ${busy ? 'pointer-events-none opacity-45' : ''}`}>{stlUrl ? 'Replace STL' : 'Upload STL'}
          <input type="file" accept=".stl,model/stl" className="sr-only" aria-label={`${label} STL`} disabled={busy} onChange={pick(assetKeys.model(slot))} /></label>
        {stlUrl && <Button disabled={busy} onClick={() => remove.mutate(assetKeys.model(slot))}>Remove STL</Button>}
        <label className={`${fileButton} ${busy ? 'pointer-events-none opacity-45' : ''}`}>{iconUrl ? 'Replace PNG' : 'Use own PNG'}
          <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`${label} icon PNG`} disabled={busy} onChange={pick(assetKeys.icon(slot))} /></label>
        {iconUrl && <Button disabled={busy} onClick={() => remove.mutate(assetKeys.icon(slot))}>Use the model</Button>}
      </div>
      {failure && <p role="alert" className="m-0 text-xs text-danger">{failure.message}</p>}
      {stlUrl && !iconUrl && <>
        {GROUPS.map(group => <details key={group.title} open={group.open} className="rounded border border-divider px-3 py-2">
          <summary className="cursor-pointer text-sm text-accent-300">{group.title}</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {group.sliders.map(([key, name, min, max, step]) => <label key={key} className="block text-xs text-ink/70">{name} ({round(o[key], 3)})
              <input type="range" min={min} max={max} step={step} value={o[key]} className="w-full" onChange={e => change({ ...o, [key]: Number(e.target.value) })} /></label>)}
          </div>
        </details>)}
        <Button onClick={() => change(DEFAULT_ORIENTATION)}>Reset pose and light</Button>
        <p className="m-0 text-xs text-ink/55">Drag the preview to turn the model, scroll to resize. Most miniature STLs are Z-up, which the default tilt handles.</p>
      </>}
      {iconUrl && <p className="m-0 text-xs text-ink/55">This PNG is used instead of the STL.</p>}
    </div>
  </div>
}
