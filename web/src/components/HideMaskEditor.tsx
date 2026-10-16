import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { drawStrokes, type Stroke } from '../lib/mask'
import { deleteImageMask, saveImageMask } from '../lib/imageMasks'
import { CardOverlayLayer } from '../pages/assemble/CardOverlayLayer'
import type { Category } from '../pages/cards/model'

const CHECKER = 'bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#3a3a3a_0%_50%)] bg-[length:16px_16px]'

// Hides parts of a generated image, like a layer mask: paint with the brush to hide, with the eraser to bring back.
// The hidden parts are cut out when a card is made from the image, so the artwork and the card's own frame show
// through. The mask is kept apart from the image, so nothing is lost; the card overlay and the template guide can be
// laid over it to see what the card needs hidden.
export function HideMaskEditor({ src, alt, generationId, hasMask, maskSrc, cardOverlay, onClose, onSaved }: {
  src: string; alt: string; generationId: number; hasMask: boolean; maskSrc?: string | null
  cardOverlay?: { factionId: number; category: Category }
  onClose: () => void; onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [base, setBase] = useState<HTMLImageElement | null>(null) // the saved mask
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [erase, setErase] = useState(false)
  const [brush, setBrush] = useState(80)
  const [view, setView] = useState<'mask' | 'result'>('mask')
  const [guide, setGuide] = useState(false), [guideOpacity, setGuideOpacity] = useState(0.5)
  const [card, setCard] = useState(false), [cardOpacity, setCardOpacity] = useState(1)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const photo = useRef<HTMLImageElement>(null), canvas = useRef<HTMLCanvasElement>(null), paint = useRef<HTMLCanvasElement | null>(null)
  const current = useRef<Stroke | null>(null)

  // The saved mask, to carry on from.
  useEffect(() => {
    if (!hasMask) { setBase(null); return }
    const img = new Image()
    img.onload = () => setBase(img)
    img.src = `/api/generations/${generationId}/mask?${Date.now()}`
  }, [generationId, hasMask])

  // The hidden area (opaque) is kept on its own canvas: the saved mask, then the strokes on top of it.
  const redraw = useCallback((extra?: Stroke) => {
    const view_ = canvas.current, image = photo.current
    if (!size || !view_ || !image) return
    const layer = paint.current ?? (paint.current = document.createElement('canvas'))
    layer.width = size.w; layer.height = size.h
    const lctx = layer.getContext('2d'), vctx = view_.getContext('2d')
    if (!lctx || !vctx) return
    lctx.clearRect(0, 0, size.w, size.h)
    if (base) lctx.drawImage(base, 0, 0, size.w, size.h)
    drawStrokes(lctx, extra ? [...strokes, extra] : strokes, '#000')
    vctx.clearRect(0, 0, size.w, size.h)
    if (view === 'result') {
      vctx.drawImage(image, 0, 0, size.w, size.h)
      vctx.globalCompositeOperation = 'destination-out'
      vctx.drawImage(layer, 0, 0)
      vctx.globalCompositeOperation = 'source-over'
    } else {
      // The hidden area, tinted over the image.
      vctx.drawImage(layer, 0, 0)
      vctx.globalCompositeOperation = 'source-in'
      vctx.fillStyle = 'rgba(255, 48, 64, 0.55)'
      vctx.fillRect(0, 0, size.w, size.h)
      vctx.globalCompositeOperation = 'source-over'
    }
  }, [size, base, strokes, view])
  useEffect(() => redraw(), [redraw])

  const toImage = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) * size!.w) / (r.width || 1), ((e.clientY - r.top) * size!.h) / (r.height || 1)]
  }
  const finish = () => { if (current.current) { const s = current.current; setStrokes(all => [...all, s]) } current.current = null }
  const dirty = strokes.length > 0
  const hides = !!base || strokes.some(s => !s.erase)

  async function save() {
    const layer = paint.current
    if (!layer) return
    setBusy(true); setError(null)
    try {
      if (!hides) await deleteImageMask(generationId)
      else {
        const png = await new Promise<Blob>((resolve, reject) => layer.toBlob(b => b ? resolve(b) : reject(new Error('Could not export the mask.')), 'image/png'))
        await saveImageMask(generationId, png)
      }
      await queryClient.invalidateQueries({ queryKey: ['image-masks'] })
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Saving failed') } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError(null)
    try { await deleteImageMask(generationId); await queryClient.invalidateQueries({ queryKey: ['image-masks'] }); onSaved() }
    catch (e) { setError(e instanceof Error ? e.message : 'Removing failed') } finally { setBusy(false) }
  }

  const tool = (on: boolean) => `cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium ${on ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`
  const off = 'disabled:cursor-not-allowed disabled:opacity-45'
  return (
    <div className="flex max-h-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
      <div className={`relative rounded-md ${CHECKER}`}>
        <img ref={photo} src={src} alt={alt} draggable={false} onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className={`block max-h-[68vh] max-w-full select-none rounded-md ${view === 'result' ? 'invisible' : ''}`} />
        {size && <canvas ref={canvas} width={size.w} height={size.h} data-testid="hide-canvas" aria-label="Hiding mask"
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-md"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); current.current = { erase, size: brush, points: [toImage(e)] }; redraw(current.current) }}
          onPointerMove={(e) => { if (!current.current) return; current.current.points.push(toImage(e)); redraw(current.current) }}
          onPointerUp={finish} onPointerLeave={finish} />}
        {guide && maskSrc && <img src={maskSrc} alt="" aria-hidden="true" data-testid="edit-guide" draggable={false} style={{ opacity: guideOpacity }} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />}
        {card && cardOverlay && <CardOverlayLayer imageUrl={src} factionId={cardOverlay.factionId} category={cardOverlay.category} opacity={cardOpacity} blank={size ?? undefined} />}
      </div>
      <div className="flex w-[min(720px,90vw)] flex-col gap-2 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={!erase} onClick={() => setErase(false)} className={tool(!erase)}>Hide</button>
          <button type="button" aria-pressed={erase} onClick={() => setErase(true)} className={tool(erase)}>Bring back</button>
          <label className="flex items-center gap-1.5 text-xs text-ink/60">Size
            <input type="range" min={8} max={400} step={4} value={brush} aria-label="Brush size" onChange={(e) => setBrush(Number(e.target.value))} className="w-28 accent-[var(--color-accent)]" /></label>
          <button type="button" disabled={!strokes.length} onClick={() => setStrokes(all => all.slice(0, -1))} className={`${tool(false)} ${off}`}>Undo</button>
          <button type="button" disabled={!dirty} onClick={() => setStrokes([])} className={`${tool(false)} ${off}`}>Reset</button>
          <span className="ml-auto text-[11px] text-ink/45">Paint over what should not show on the card</span>
        </div>
        <div role="group" aria-label="View" className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-ink/50">View</span>
          <button type="button" aria-pressed={view === 'mask'} onClick={() => setView('mask')} className={tool(view === 'mask')}>Mask</button>
          <button type="button" aria-pressed={view === 'result'} onClick={() => setView('result')} className={tool(view === 'result')}>Result</button>
          {maskSrc && <button type="button" aria-pressed={guide} onClick={() => setGuide(v => !v)} className={tool(guide)}>Template guide</button>}
          {guide && maskSrc && <input type="range" min={0.1} max={1} step={0.05} value={guideOpacity} aria-label="Template guide opacity" onChange={(e) => setGuideOpacity(Number(e.target.value))} className="w-24 accent-[var(--color-accent)]" />}
          {cardOverlay && <button type="button" aria-pressed={card} onClick={() => setCard(v => !v)} className={tool(card)}>Card overlay</button>}
          {card && cardOverlay && <input type="range" min={0.1} max={1} step={0.05} value={cardOpacity} aria-label="Card overlay opacity" onChange={(e) => setCardOpacity(Number(e.target.value))} className="w-24 accent-[var(--color-accent)]" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {error && <span role="alert" className="text-xs text-danger">{error}</span>}
          <span className="ml-auto flex gap-2">
            {hasMask && <button type="button" disabled={busy} onClick={remove} className={`${tool(false)} ${off}`}>Remove mask</button>}
            <button type="button" onClick={onClose} className={tool(false)}>Cancel</button>
            <button type="button" disabled={busy || !size || (!dirty && hasMask)} onClick={save} title={hides ? undefined : 'Nothing is hidden'}
              className="cursor-pointer rounded-md border border-accent bg-transparent px-3 py-1 text-xs font-medium text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-45">
              {busy ? 'Saving…' : 'Save mask'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
