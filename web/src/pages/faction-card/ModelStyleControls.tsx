import type { ModelStyle } from './model'

const SLIDERS = [
  ['shadow', 'Shadow strength', 0, 1, 0.01], ['shadowBlur', 'Shadow softness', 0, 0.2, 0.005],
  ['shadowX', 'Shadow left/right', -0.15, 0.15, 0.005], ['shadowY', 'Shadow up/down', -0.15, 0.15, 0.005],
  ['outline', 'White outline width', 0, 0.04, 0.001],
  ['innerShadow', 'Inner shadow strength', 0, 1, 0.01], ['innerShadowSize', 'Inner shadow size', 0.005, 0.12, 0.005],
  ['contrast', 'Contrast', 0.5, 2, 0.01],
] as const

// Drop shadow, outline, inner shadow and contrast of every unit icon on the faction card.
export function ModelStyleControls({ value, onChange, onStart, open }: { value: ModelStyle; onChange: (value: ModelStyle) => void; onStart?: () => void; open?: boolean }) {
  return <details open={open} className="rounded border border-divider px-3 py-2">
    <summary className="cursor-pointer text-sm text-accent-300">Model shadow, outline and contrast (all units and factions)</summary>
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
      {SLIDERS.map(([key, name, min, max, step]) => <label key={key} className="block text-xs text-ink/70">{name} ({Math.round(value[key] * 1000) / 1000})
        <input type="range" min={min} max={max} step={step} value={value[key]} className="w-full" onPointerDown={onStart} onChange={e => onChange({ ...value, [key]: Number(e.target.value) })} /></label>)}
    </div>
  </details>
}
