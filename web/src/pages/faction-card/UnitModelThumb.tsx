import { useEffect, useMemo, useRef, useState } from 'react'
import { withDefaults, type Orientation } from './model'
import { renderModelIcon } from './stl'

// The unit's icon as the card will draw it. Clicking it opens the model
// editor (see UnitModelDialog).
export function UnitModelThumb({ label, stlUrl, iconUrl, orientation, color, onOpen }: {
  label: string; stlUrl?: string; iconUrl?: string; orientation: Partial<Orientation> | undefined; color: string; onOpen: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const o = useMemo(() => withDefaults(orientation), [orientation])
  useEffect(() => {
    const target = canvas.current
    if (!stlUrl || iconUrl || !target) return
    let cancelled = false
    const timer = window.setTimeout(() => renderModelIcon(stlUrl, o, color, 160).then(icon => {
      if (cancelled) return
      setFailed(false); target.width = icon.width; target.height = icon.height
      target.getContext('2d')?.drawImage(icon, 0, 0)
    }).catch(() => { if (!cancelled) setFailed(true) }), 60)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [stlUrl, iconUrl, o, color])
  const has = !!(stlUrl || iconUrl)
  return <>
    <button type="button" aria-label={`${label} model`} title={has ? 'Edit model' : 'Add a model'} onClick={onOpen}
      className="grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-divider bg-black/30 p-0 text-[11px] text-ink/50 hover:border-accent/70">
      {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-contain" />
        : stlUrl && !failed ? <canvas ref={canvas} className="h-full w-full" />
        : stlUrl ? 'Model error' : '+ Model'}
    </button>

  </>
}
