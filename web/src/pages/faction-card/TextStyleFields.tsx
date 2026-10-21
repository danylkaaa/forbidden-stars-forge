import { inputClass } from '../../components/Field'
import { Button } from '../../components/Button'
import { TEXT_STYLES, type TextKey, type TextStyle, type TextStyles } from './model'

const round = (n: number) => Math.round(n * 100) / 100

// Font size (% of the designed size) and line spacing of each text on one side of the card.
// `value` holds only what is set here; an empty field falls back to `base`, shown as its placeholder.
export function TextStyleFields({ side, value, base, onChange, label }: { side: 'front' | 'back'; value: TextStyles; base: Record<TextKey, TextStyle>; onChange: (value: TextStyles) => void; label: string }) {
  const set = (key: TextKey, field: keyof TextStyle, text: string) => {
    const n = Number(text), own = { ...value[key] }
    if (text.trim() === '' || !Number.isFinite(n) || n <= 0) delete own[field]
    else own[field] = field === 'scale' ? round(n / 100) : round(n)
    const next = { ...value, [key]: own }
    if (!Object.keys(own).length) delete next[key]
    onChange(next)
  }
  return <div role="group" aria-label={label} className="space-y-1">
    <div className="grid grid-cols-[1fr_5.5rem_5.5rem_4.5rem] gap-2 text-[11px] text-ink/55"><span>Text</span><span>Size %</span><span>Line spacing</span><span /></div>
    {TEXT_STYLES.filter(s => s.side === side).map(({ key, label: name, lineHeight }) => { const own = value[key]
      return <div key={key} className="grid grid-cols-[1fr_5.5rem_5.5rem_4.5rem] items-center gap-2">
        <span className="text-xs text-ink/80">{name}</span>
        <input type="number" min={10} step={5} aria-label={`${name} size %`} className={inputClass} placeholder={String(Math.round(base[key].scale * 100))}
          value={own?.scale === undefined ? '' : Math.round(own.scale * 100)} onChange={e => set(key, 'scale', e.target.value)} />
        {lineHeight === null ? <span className="text-center text-xs text-ink/35">one line</span>
          : <input type="number" min={0.5} step={0.05} aria-label={`${name} line spacing`} className={inputClass} placeholder={String(base[key].lineHeight)}
            value={own?.lineHeight ?? ''} onChange={e => set(key, 'lineHeight', e.target.value)} />}
        <Button disabled={!own} aria-label={`Reset ${name}`} onClick={() => { const next = { ...value }; delete next[key]; onChange(next) }}>Reset</Button>
      </div> })}
  </div>
}
