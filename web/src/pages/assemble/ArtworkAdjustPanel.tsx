import { useState, type ReactNode } from 'react'
import { fullAdjust, isNeutralAdjust, NEUTRAL_ADJUST, type ArtworkAdjust, type FullAdjust } from './artwork'
import { Button } from '../../components/Button'

type Control = { key: keyof FullAdjust; label: string; min: number; max: number; step: number }
const percent = (key: Control['key'], label: string): Control => ({ key, label, min: -100, max: 100, step: 1 })
const GROUPS: { title?: string; controls: Control[] }[] = [
  { controls: [percent('brightness', 'Brightness'), percent('contrast', 'Contrast'), percent('shadows', 'Shadows'), percent('highlights', 'Highlights')] },
  { title: 'Colour', controls: [percent('saturation', 'Saturation'), percent('vibrance', 'Vibrance'), { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1 }, percent('temperature', 'Temperature'), percent('tint', 'Tint')] },
  { title: 'Detail', controls: [{ key: 'sharpness', label: 'Sharpness', min: 0, max: 100, step: 1 }, percent('vignette', 'Vignette')] },
]

// Tone, colour and levels of an image; collapsed until needed. `idPrefix` keeps the field ids apart when several panels share a page.
export function ArtworkAdjustPanel({ adjust, onChange, idPrefix = 'adjust', title = 'Image adjustments', defaultOpen = false, actions }: {
  adjust?: ArtworkAdjust; onChange: (next: ArtworkAdjust) => void; idPrefix?: string; title?: string; defaultOpen?: boolean; actions?: ReactNode
}) {
  const value = fullAdjust(adjust)
  // The sliders are built only while the panel is open: a page can hold many panels.
  const [open, setOpen] = useState(defaultOpen)
  const set = (key: keyof FullAdjust, v: number) => {
    if (!Number.isFinite(v)) return
    const next = { ...value, [key]: v }
    // The black point stays below the white point.
    if (key === 'black') next.black = Math.min(v, value.white - 1)
    if (key === 'white') next.white = Math.max(v, value.black + 1)
    onChange(next)
  }
  const row = ({ key, label, min, max, step }: Control) => (
    <div key={key} className="flex items-center gap-2 text-xs">
      <label htmlFor={`${idPrefix}-${key}`} className="w-20 flex-none text-ink/70">{label}</label>
      <input id={`${idPrefix}-${key}`} type="range" min={min} max={max} step={step} value={value[key]} onChange={e => set(key, Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--color-accent)]" />
      <input type="number" aria-label={`${label} value`} min={min} max={max} step={step} value={value[key]} onChange={e => set(key, Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-16 rounded border border-divider bg-bg px-1.5 py-0.5 text-right font-mono text-xs text-ink" />
    </div>
  )
  const heading = (text: string) => <div key={text} className="text-[11px] font-medium uppercase tracking-wider text-ink/50">{text}</div>
  return <details className="text-sm" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-accent">{title}{isNeutralAdjust(adjust) ? '' : ' (changed)'}</summary>
    {open && <div className="mt-2 space-y-2">
      {GROUPS.map(g => [g.title && heading(g.title), ...g.controls.map(row)])}
      {heading('Levels')}
      {row({ key: 'black', label: 'Black point', min: 0, max: 254, step: 1 })}
      {row({ key: 'gamma', label: 'Midtones', min: 0.2, max: 3, step: 0.05 })}
      {row({ key: 'white', label: 'White point', min: 1, max: 255, step: 1 })}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={isNeutralAdjust(adjust)} onClick={() => onChange(NEUTRAL_ADJUST)}>Reset adjustments</Button>
        {actions}
      </div>
    </div>}
  </details>
}
