// A number field with tiny − and + buttons; the browser's own spin arrows are
// hidden. Whole numbers only.
export function StepperInput({ id, value, min = 0, max = 999, onChange, label, disabled, title }: { id: string; value: number; min?: number; max?: number; onChange: (value: number) => void; label?: string; disabled?: boolean; title?: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.floor(n) || 0))
  const button = 'grid h-8 w-5 shrink-0 cursor-pointer place-items-center border border-divider bg-surface p-0 text-sm leading-none text-ink/80 hover:border-accent/60 hover:text-accent disabled:cursor-default disabled:opacity-35'
  return <div className={`flex min-w-0 items-stretch ${disabled ? 'pointer-events-none opacity-45' : ''}`} title={title}>
    <button type="button" tabIndex={-1} aria-label={`${label ?? 'Value'} minus`} disabled={disabled || value <= min} className={`${button} rounded-l-md border-r-0`} onClick={() => onChange(clamp(value - 1))}>−</button>
    <input id={id} type="number" disabled={disabled} inputMode="numeric" min={min} max={max} step={1} value={value} onChange={e => onChange(clamp(Number(e.target.value)))}
      className="min-h-8 w-full min-w-0 border border-divider bg-bg px-1 text-center font-mono text-sm text-ink [appearance:textfield] focus:border-accent focus:outline-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none" />
    <button type="button" tabIndex={-1} aria-label={`${label ?? 'Value'} plus`} disabled={disabled || value >= max} className={`${button} rounded-r-md border-l-0`} onClick={() => onChange(clamp(value + 1))}>+</button>
  </div>
}
