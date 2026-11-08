import { useEffect, useRef } from 'react'
import { DEFAULT_LAYERS, type FrontLayers } from './model'

export type LayerKey = keyof FrontLayers
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Over the front preview while arranging: dragging moves the chosen layer (background or plate), scrolling zooms it.
// Positions are fractions of the card, so the preview's size does not matter.
export function LayerArrange({ layers, layer, onChange, onStart = () => {} }: { layers: FrontLayers; layer: LayerKey; onChange: (layers: FrontLayers) => void; onStart?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; start: FrontLayers } | null>(null)
  const latest = useRef({ layers, layer, onChange, onStart })
  latest.current = { layers, layer, onChange, onStart }

  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const { layers, layer, onChange, onStart } = latest.current, p = layers[layer]
      onStart()
      onChange({ ...layers, [layer]: { ...p, scale: clamp(p.scale * Math.exp(-e.deltaY * 0.0015), 0.1, 5) } })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  return <div ref={box} role="application" aria-label={`Arrange the ${layer}: drag to move, scroll to zoom`} className="absolute inset-0 z-[7] cursor-move touch-none rounded outline-2 outline-dashed outline-accent"
    onPointerDown={e => { onStart(); drag.current = { x: e.clientX, y: e.clientY, start: layers }; e.currentTarget.setPointerCapture(e.pointerId) }}
    onPointerMove={e => {
      const d = drag.current, rect = box.current?.getBoundingClientRect()
      if (!d || !rect) return
      const p = d.start[layer]
      onChange({ ...d.start, [layer]: { ...p, x: clamp(p.x + (e.clientX - d.x) / rect.width, -1, 2), y: clamp(p.y + (e.clientY - d.y) / rect.height, -1, 2) } })
    }}
    onPointerUp={() => { drag.current = null }} />
}

// The arrange controls: which layer, its numbers, reset.
export function LayerControls({ layers, layer, onLayer, onChange, arranging, onArranging }: {
  layers: FrontLayers; layer: LayerKey; onLayer: (l: LayerKey) => void; onChange: (layers: FrontLayers) => void; arranging: boolean; onArranging: (on: boolean) => void
}) {
  const p = layers[layer]
  const slider = (key: 'x' | 'y' | 'scale', label: string, min: number, max: number) => (
    <label className="flex items-center gap-2 text-xs text-ink/70">
      <span className="w-12">{label}</span>
      <input type="range" min={min} max={max} step={0.002} value={p[key]} onChange={e => onChange({ ...layers, [layer]: { ...p, [key]: Number(e.target.value) } })} className="w-32 accent-[var(--color-accent)]" />
      <span className="w-10 tabular-nums">{Math.round(p[key] * 100)}%</span>
    </label>
  )
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink/80">
        <input type="checkbox" checked={arranging} onChange={e => onArranging(e.target.checked)} className="accent-[var(--color-accent)]" />Arrange on the preview
      </label>
      <div role="radiogroup" aria-label="Layer" className="inline-flex overflow-hidden rounded-md border border-divider">
        {(['background', 'plate'] as const).map(l => <button key={l} type="button" role="radio" aria-checked={layer === l} onClick={() => onLayer(l)}
          className={`cursor-pointer border-0 px-3 py-1 text-xs ${layer === l ? 'bg-accent/15 text-accent' : 'bg-transparent text-ink'}`}>{l === 'background' ? 'Background' : 'Plate'}</button>)}
      </div>
      <button type="button" onClick={() => onChange({ ...layers, [layer]: DEFAULT_LAYERS[layer] })} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent">Reset {layer}</button>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {slider('x', 'Across', -0.5, 1.5)}
      {slider('y', 'Down', -0.5, 1.5)}
      {slider('scale', layer === 'background' ? 'Zoom' : 'Height', 0.1, layer === 'background' ? 4 : 2)}
    </div>
    <p className="m-0 text-[11px] text-ink/45">{arranging ? 'Drag on the front preview to move it, scroll to zoom.' : 'Tick “Arrange on the preview” to drag and scroll on the card.'} The background covers the card at 100%; the plate’s size is its height on the card.</p>
  </div>
}
