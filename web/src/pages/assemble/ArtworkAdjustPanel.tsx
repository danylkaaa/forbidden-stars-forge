import { isNeutralAdjust, NEUTRAL_ADJUST, type ArtworkAdjust } from './artwork'
import { Button } from '../../components/Button'

type Control = { key: keyof ArtworkAdjust; label: string; min: number; max: number; step: number }
const TONE: Control[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100, step: 1 },
]

// Tone, colour and levels of the artwork; collapsed until needed.
export function ArtworkAdjustPanel({ adjust, onChange }: { adjust?: ArtworkAdjust; onChange: (next: ArtworkAdjust) => void }) {
  const value = adjust ?? NEUTRAL_ADJUST
  const set = (key: keyof ArtworkAdjust, v: number) => {
    if (!Number.isFinite(v)) return
    const next = { ...value, [key]: v }
    // The black point stays below the white point.
    if (key === 'black') next.black = Math.min(v, value.white - 1)
    if (key === 'white') next.white = Math.max(v, value.black + 1)
    onChange(next)
  }
  const row = ({ key, label, min, max, step }: Control) => (
    <div key={key} className="flex items-center gap-2 text-xs">
      <label htmlFor={`adjust-${key}`} className="w-20 flex-none text-ink/70">{label}</label>
      <input id={`adjust-${key}`} type="range" min={min} max={max} step={step} value={value[key]} onChange={e => set(key, Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--color-accent)]" />
      <input type="number" aria-label={`${label} value`} min={min} max={max} step={step} value={value[key]} onChange={e => set(key, Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-16 rounded border border-divider bg-bg px-1.5 py-0.5 text-right font-mono text-xs text-ink" />
    </div>
  )
  return <details className="text-sm">
    <summary className="cursor-pointer text-accent">Image adjustments{isNeutralAdjust(adjust) ? '' : ' (changed)'}</summary>
    <div className="mt-2 space-y-2">
      {TONE.map(row)}
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink/50">Levels</div>
      {row({ key: 'black', label: 'Black point', min: 0, max: 254, step: 1 })}
      {row({ key: 'gamma', label: 'Midtones', min: 0.2, max: 3, step: 0.05 })}
      {row({ key: 'white', label: 'White point', min: 1, max: 255, step: 1 })}
      <Button disabled={isNeutralAdjust(adjust)} onClick={() => onChange(NEUTRAL_ADJUST)}>Reset adjustments</Button>
    </div>
  </details>
}
