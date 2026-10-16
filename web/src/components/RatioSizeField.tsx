import { useEffect, useState } from 'react'
import { Field, inputClass } from './Field'
import { MAX_ELEMENT_RATIO, parseSize, ratioOf, sizeAndAspect } from '../lib/imageSize'

// The ratio inputs (width : height) for a stored size and crop shape.
function ratioFrom(size: string, aspect: string): { w: string; h: string } {
  const r = Number(aspect)
  if (r > 0) return r >= 1 ? { w: String(Math.round(r * 100) / 100), h: '1' } : { w: '1', h: String(Math.round(100 / r) / 100) }
  return ratioOf(size)
}

// An element's AI image size, given as an aspect ratio from 1:20 to 20:1. The model makes pictures up to 3:1, so a
// wider (or taller) shape is made at 3:1 and cropped to the ratio. The pixel size is worked out (longer side 1536,
// both sides divisible by 16).
export function RatioSizeField({ value, aspect, onChange, previewSrc }: { value: string; aspect: string; onChange: (size: string, aspect: string) => void; previewSrc?: string | null }) {
  const [ratio, setRatio] = useState(() => ratioFrom(value, aspect))
  const solved = (r: { w: string; h: string }) => sizeAndAspect(Number(r.w), Number(r.h))
  // Follow changes that did not come from these inputs (loading, discarding edits).
  useEffect(() => {
    const own = solved(ratio)
    if (value !== (own ? `${own.size.w}x${own.size.h}` : '') || aspect !== (own?.aspect ?? '')) setRatio(ratioFrom(value, aspect))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, aspect])
  const change = (next: { w: string; h: string }) => {
    setRatio(next)
    const r = solved(next)
    onChange(r ? `${r.size.w}x${r.size.h}` : '', r?.aspect ?? '')
  }
  const size = parseSize(value), shape = Number(aspect) > 0 ? Number(aspect) : size ? size.w / size.h : 0
  const invalid = (ratio.w !== '' || ratio.h !== '') && !size
  // The finished picture: the generated size cropped to the shape.
  const finished = size && shape > 0 ? (size.w / size.h > shape ? { w: Math.round(size.h * shape), h: size.h } : { w: size.w, h: Math.round(size.w / shape) }) : null
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Ratio, width">{(id) => <input id={id} type="number" min={0.05} step={0.1} value={ratio.w} onChange={(e) => change({ ...ratio, w: e.target.value })} className={inputClass} />}</Field>
        <Field label="Ratio, height">{(id) => <input id={id} type="number" min={0.05} step={0.1} value={ratio.h} onChange={(e) => change({ ...ratio, h: e.target.value })} className={inputClass} />}</Field>
      </div>
      {invalid && <p role="alert" className="m-0 text-xs text-danger">Enter a width and a height; the ratio must be between 1:{MAX_ELEMENT_RATIO} and {MAX_ELEMENT_RATIO}:1.</p>}
      <div className="flex flex-col items-center gap-1" aria-label="Image frame preview">
        {size && finished ? <>
          <div style={{ aspectRatio: `${finished.w} / ${finished.h}`, width: `min(100%, ${(7 * finished.w / finished.h).toFixed(3)}rem)` }}
            className="relative overflow-hidden rounded border border-dashed border-accent/60 bg-[repeating-conic-gradient(var(--color-accent-700)_0%_25%,var(--color-accent-900)_0%_50%)] bg-[length:12px_12px]">
            {previewSrc && <img src={previewSrc} alt="Template in the image frame" className="block h-full w-full object-fill" />}
          </div>
          <span className="font-mono text-[10px] text-ink/55">{size.w} × {size.h} px</span>
          {Number(aspect) > 0 && <span className="text-[10px] text-ink/55">Made at that size, then cropped to {finished.w} × {finished.h} px around the centre. Keep the ornament inside that band.</span>}
        </> : <span className="text-[11px] text-ink/45">No frame: the size follows the template image.</span>}
      </div>
    </div>
  )
}
