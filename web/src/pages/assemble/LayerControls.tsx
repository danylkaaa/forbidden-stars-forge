import { useEffect, useState } from 'react'
import { Field, inputClass } from '../../components/Field'
import type { Layer, Placement } from './model'

export function PositionNumber({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const number = Number(text.replace(',', '.'))
  const valid = text.trim() !== '' && Number.isFinite(number) && number >= min && number <= max
  return <input id={id} inputMode="decimal" className={inputClass} value={text} aria-invalid={!valid}
    onChange={e => {
      const next = e.target.value; setText(next)
      const n = Number(next.replace(',', '.'))
      if (next.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n)
    }} onBlur={() => setText(String(valid ? number : value))} />
}

// Box, size and spacing for one layer. Fonts, colours, left alignment and
// plain resource icons are fixed.
export function PlacementFields({ layer, p, move }: { layer: Layer; p: Placement; move: (patch: Partial<Placement>) => void }) {
  return <>
    <div className="grid grid-cols-2 gap-3">{(layer === 'logo' || layer === 'order_icon' ? ['x', 'y', 'width', 'height'] as const : layer === 'resources' ? ['x', 'y', 'size', 'lineHeight'] as const : ['x', 'y', 'width', 'height', 'size', 'lineHeight'] as const).map(key => <Field key={key} label={{ x: 'Start X (%)', y: 'Start Y (%)', width: 'Box width (%)', height: 'Box height (%)', size: layer === 'resources' ? 'Icon size (%)' : 'Font size (%)', lineHeight: layer === 'resources' ? 'Icon spacing' : 'Line spacing' }[key]}>{id => <PositionNumber key={`${layer}-${key}`} id={id} value={p[key]} min={key === 'x' || key === 'y' ? -100 : 0.1} max={key === 'lineHeight' ? 5 : 200} onChange={n => move({ [key]: n })} />}</Field>)}</div>
    {(layer === 'upper_text' || layer === 'lower_text') && <div className="grid grid-cols-2 gap-3">{(['paddingTop', 'paddingBottom'] as const).map(key => <Field key={key} label={key === 'paddingTop' ? 'Top padding (% of width)' : 'Bottom padding (% of width)'}>{id => <PositionNumber key={`${layer}-${key}`} id={id} value={p[key] ?? 4} min={0} max={20} onChange={n => move({ [key]: n })} />}</Field>)}</div>}
    {layer === 'order_icon' && <p className="m-0 text-xs text-ink/60">The order’s hexagon is fitted inside this box, centred.</p>}
    {layer === 'logo' && <p className="m-0 text-xs text-ink/60">The logo is fitted inside this box, centred, on starting cards. Upload logos on Library → Factions.</p>}
  </>
}
