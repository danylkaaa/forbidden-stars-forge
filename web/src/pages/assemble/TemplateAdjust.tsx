import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fullAdjust, isNeutralAdjust, NEUTRAL_ADJUST, type ArtworkAdjust } from './artwork'
import { ArtworkAdjustPanel } from './ArtworkAdjustPanel'
import { paintPreview, previewBase } from './adjustedImage'
import { Button } from '../../components/Button'
import { saveTemplateAdjust, useAssemblyTemplates, type AssemblyTemplate, type Side } from './api'
import { useLibraryImages } from './library'
import type { Category } from '../cards/model'

// The image shown with its correction applied, at preview size, on a canvas.
function AdjustedPreview({ url, adjust, alt }: { url: string; adjust: ArtworkAdjust | undefined; alt: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false, frame = 0
    previewBase(url, PREVIEW_WIDTH).then(base => {
      // One paint per frame, whatever the slider's speed.
      frame = requestAnimationFrame(() => { if (!cancelled && canvas.current) paintPreview(canvas.current, base, adjust ?? NEUTRAL_ADJUST) })
    }).catch(() => {})
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [url, adjust])
  return <canvas ref={canvas} role="img" aria-label={alt} className="block aspect-[816/1104] w-full rounded border border-divider object-cover" />
}

// Tone and colour correction of one image a faction has chosen for a card type and side. It is applied wherever cards are
// made from the image. Changes stay in this browser (the preview, and with `preview` off the cards themselves) until Save.
const PREVIEW_WIDTH = 720
// Cards drawn from the image are redrawn at full size, so they follow the sliders after a short rest.
const CARDS_DELAY = 250

export function TemplateAdjust({ factionId, category, side, label, preview = true }: { factionId: number; category: Category; side: Side; label: string; preview?: boolean }) {
  const templates = useAssemblyTemplates(), images = useLibraryImages()
  const row = templates.data?.find(t => t.faction_id === factionId && t.category === category && (t.side ?? 'front') === side)
  const image = row && images.data.find(i => i.key === row.image_key)
  const queryClient = useQueryClient()
  // What the server has: the value when this opened, then whatever was last saved.
  const saved = useRef(row?.adjust)
  const [, tick] = useState(0)
  const [draft, setDraft] = useState<ArtworkAdjust | undefined>(row?.adjust)
  const show = (adjust: ArtworkAdjust | undefined) => {
    if (!preview) queryClient.setQueryData<AssemblyTemplate[]>(['assembly-templates'], rows => rows?.map(t => t.faction_id === factionId && t.category === category && (t.side ?? 'front') === side ? { ...t, adjust: isNeutralAdjust(adjust) ? undefined : adjust } : t))
  }
  const save = useMutation({
    mutationFn: (adjust: ArtworkAdjust | undefined) => saveTemplateAdjust(factionId, category, side, isNeutralAdjust(adjust) ? null : adjust!),
    onSuccess: (_, adjust) => { saved.current = adjust; tick(n => n + 1); return queryClient.invalidateQueries({ queryKey: ['assembly-templates'] }) },
  })
  const dirty = !(isNeutralAdjust(draft) && isNeutralAdjust(saved.current)) && JSON.stringify(fullAdjust(draft)) !== JSON.stringify(fullAdjust(saved.current))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const change = (next: ArtworkAdjust) => { setDraft(next); save.reset(); clearTimeout(timer.current); timer.current = setTimeout(() => show(next), CARDS_DELAY) }
  const discard = () => { clearTimeout(timer.current); setDraft(saved.current); save.reset(); show(saved.current) }
  if (!row) return <p className="m-0 text-sm text-ink/60">{label}: no image chosen yet.</p>
  const actions = <>
    <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>{save.isPending ? 'Saving…' : `Save ${label.toLowerCase()}`}</Button>
    <Button disabled={!dirty || save.isPending} onClick={discard}>Discard</Button>
  </>
  const status = save.isError && <p role="alert" className="m-0 text-xs text-danger">{save.error.message}</p>
  const panel = <ArtworkAdjustPanel idPrefix={`adjust-${category}-${side}`} title={dirty ? `${label} (unsaved)` : label} adjust={draft} onChange={change} actions={actions} />
  if (!preview) return <>{panel}{status}</>
  return <div className="flex flex-wrap items-start gap-6">
    {image && <div className="w-[min(100%,26rem)] flex-none"><AdjustedPreview url={image.url} adjust={draft} alt={`${label} image`} /></div>}
    <div className="min-w-[18rem] max-w-xl flex-1 space-y-2">{panel}{status}</div>
  </div>
}
