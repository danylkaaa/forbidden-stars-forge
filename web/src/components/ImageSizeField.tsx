import { useEffect, useState } from 'react'
import { Field, inputClass, selectClass } from './Field'
import { DEFAULT_DPI, DPI_OPTIONS, mmToPx, parseSize, pxToMm, sizeError, suggestSize } from '../lib/imageSize'

type Fields = { mmH: string; mmW: string; pxH: string; pxW: string }

function fromSize(size: string, dpi: number): Fields {
  const s = parseSize(size)
  return s
    ? { mmH: String(pxToMm(s.h, dpi)), mmW: String(pxToMm(s.w, dpi)), pxH: String(s.h), pxW: String(s.w) }
    : { mmH: '', mmW: '', pxH: '', pxW: '' }
}

// A card type's AI image size ("<width>x<height>" px), edited as millimetres at a DPI or as pixels;
// the other fields follow. Changing the DPI keeps the physical size and recomputes the pixels.
export function ImageSizeField({ value, onChange, previewSrc }: { value: string; onChange: (size: string) => void; previewSrc?: string | null }) {
  const [dpi, setDpi] = useState(DEFAULT_DPI)
  const [f, setF] = useState<Fields>(() => fromSize(value, DEFAULT_DPI))

  // Follow changes that did not come from these inputs (loading, discarding edits).
  useEffect(() => {
    if (value !== `${f.pxW}x${f.pxH}`) setF(fromSize(value, dpi))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (next: Fields) => {
    setF(next)
    onChange(next.pxW === '' && next.pxH === '' ? '' : `${next.pxW}x${next.pxH}`)
  }
  const fromMm = (axis: 'H' | 'W', text: string, d = dpi): Fields => {
    const next = { ...f, [`mm${axis}`]: text }
    const mm = Number(text)
    next[`px${axis}`] = text !== '' && mm > 0 ? String(mmToPx(mm, d)) : ''
    return next
  }
  const fromPx = (axis: 'H' | 'W', text: string): Fields => {
    const next = { ...f, [`px${axis}`]: text }
    const px = Number(text)
    next[`mm${axis}`] = text !== '' && px > 0 ? String(pxToMm(px, dpi)) : ''
    return next
  }
  const changeDpi = (d: number) => {
    setDpi(d)
    const h = fromMm('H', f.mmH, d)
    commit({ ...fromMm('W', f.mmW, d), pxH: h.pxH })
  }

  const num = (label: string, text: string, onText: (v: string) => void, step: string) => (
    <Field label={label}>
      {(id) => <input id={id} type="number" min={0} step={step} value={text} onChange={(e) => onText(e.target.value)} className={inputClass} />}
    </Field>
  )
  const frame = parseSize(value)
  const error = sizeError(value)
  const suggestion = error ? suggestSize(value) : null
  const apply = () => {
    if (!suggestion) return
    const { w, h } = suggestion
    setF({ pxW: String(w), pxH: String(h), mmW: String(pxToMm(w, dpi)), mmH: String(pxToMm(h, dpi)) })
    onChange(`${w}x${h}`)
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-3.5">
        {num('Height (mm)', f.mmH, (v) => commit(fromMm('H', v)), '0.1')}
        {num('Width (mm)', f.mmW, (v) => commit(fromMm('W', v)), '0.1')}
        <Field label="DPI">
          {(id) => (
            <select id={id} value={dpi} onChange={(e) => changeDpi(Number(e.target.value))} className={selectClass}>
              {DPI_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3.5">
        {num('Height (px)', f.pxH, (v) => commit(fromPx('H', v)), '1')}
        {num('Width (px)', f.pxW, (v) => commit(fromPx('W', v)), '1')}
      </div>
      {error && (
        <p role="alert" className="m-0 flex flex-wrap items-center gap-2 text-xs text-danger">
          {error}
          {suggestion && <button type="button" onClick={apply} title="Same shape, scaled to a size OpenAI accepts"
            className="cursor-pointer rounded border border-danger/50 bg-transparent px-2 py-0.5 text-xs text-danger hover:bg-danger/10">
            Scale to {suggestion.w} × {suggestion.h} px ({pxToMm(suggestion.w, dpi)} × {pxToMm(suggestion.h, dpi)} mm)
          </button>}
        </p>
      )}
      <div className="flex flex-col items-center gap-1" aria-label="Image frame preview">
        {frame && !error ? (
          <div style={{ aspectRatio: `${frame.w} / ${frame.h}`, width: `min(100%, ${(11 * frame.w / frame.h).toFixed(3)}rem)` }}
            className="relative overflow-hidden rounded border border-dashed border-accent/60 bg-[repeating-conic-gradient(var(--color-accent-700)_0%_25%,var(--color-accent-900)_0%_50%)] bg-[length:12px_12px]">
            {previewSrc && <img src={previewSrc} alt="Template in the image frame" className="block h-full w-full object-fill" />}
          </div>
        ) : <span className="text-[11px] text-ink/45">No frame: the size follows the template image.</span>}
        {frame && !error && <span className="font-mono text-[10px] text-ink/55">{frame.w} × {frame.h} px · {pxToMm(frame.w, dpi)} × {pxToMm(frame.h, dpi)} mm at {dpi} dpi</span>}
      </div>
    </div>
  )
}
