import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LayerControls, LayeredImage } from './PreviewLayers'
import { FavoriteButton } from './FavoriteButton'
import type { ImageRef } from '../lib/favorites'
import { useStartImageEdit } from '../lib/imageEdits'
import type { Generation } from '../pages/test-generation/api'
import { MaskEditor } from './MaskEditor'
import { exportMask, type Stroke } from '../lib/mask'
import { QuickCardPreview } from '../pages/assemble/QuickCardPreview'
import { CardOverlayLayer } from '../pages/assemble/CardOverlayLayer'
import { HideMaskEditor } from './HideMaskEditor'
import { maskedImageUrl, useImageMasks } from '../lib/imageMasks'
import { GenerationPreview3D } from '../pages/assemble/GenerationPreview3D'
import { BackFlatPreview } from '../pages/assemble/BackLogoPreview'
import { EditIcon, MaskIcon } from './icons'
import { ConfirmDialog } from './ConfirmDialog'

type CombatPreviewProps = { backPreviewCategory?: import('../pages/cards/model').Category; cardPreviewCategory?: import('../pages/cards/model').Category; combatPreviewSide?: 'front' | 'back'; previewFactionId?: number }

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function downloadImage(src: string, filename: string) {
  saveBlob(await (await fetch(src)).blob(), filename)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'image'

// The image's favorite state, when it can be starred from the popup.
export type FavoriteProp = { target: ImageRef; value: boolean }

// Full-size image popup. Closes on backdrop click, the × button, or Escape.
// The gold checkerboard behind the image shows real alpha transparency;
// a grey/white checkerboard means the model painted one into the pixels.
// The mask layer and its toggle come from PreviewLayers; Download saves the
// raw image. With `cardPreviewFactionId`, Card preview shows the image
// assembled as a card of that faction instead.
// Area-edit support: editTarget makes "Edit area" available; compareSrc
// (the image this one was edited from) enables the Original toggle.
export type EditProps = {
  editTarget?: ImageRef
  compareSrc?: string | null
  onEdited?: (g: Generation) => void
}

export function ImageLightbox({
  src, alt, maskSrc, cardPreviewFactionId, cardPreviewCategory, combatPreviewSide, previewFactionId, backPreviewCategory, downloadName, favorite, editTarget, compareSrc, onEdited, onClose, startEditing = false, startHiding = false,
}: {
  src: string; alt: string; maskSrc?: string | null; cardPreviewFactionId?: number
  downloadName?: string // file name without extension; defaults to a slug of alt
  favorite?: FavoriteProp
  onClose: () => void
  startEditing?: boolean // open straight in area-edit mode
  startHiding?: boolean // open straight in hide-areas mode
} & EditProps & CombatPreviewProps) {
  const [asCard, setAsCard] = useState(false)
  const [previewCardId, setPreviewCardId] = useState(0)
  const [editing, setEditing] = useState(startEditing && !startHiding && !!editTarget)
  // Hiding areas of a generated image (a mask kept apart from it) is its own mode.
  const [hiding, setHiding] = useState(startHiding && editTarget?.kind === 'generation')
  const masks = useImageMasks()
  const hasMask = editTarget?.kind === 'generation' && !!masks.data?.some((m) => m.generation_id === editTarget.id)
  const tools = !editing && !hiding
  const [showOriginal, setShowOriginal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const shownSrc = showOriginal && compareSrc ? compareSrc : src
  const [editDirty, setEditDirty] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState<(() => void) | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function onDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadImage(src, `${downloadName || slug(alt)}.png`)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'download failed')
    } finally {
      setDownloading(false)
    }
  }

  // Leaving a half-made edit (painted area or instruction) asks first.
  const guard = (leave: () => void) => { if (editing && editDirty) setConfirmDiscard(() => leave); else leave() }
  const leaveEditing = () => { setEditing(false); setEditDirty(false) }
  const guardRef = useRef(guard)
  guardRef.current = guard

  // Escape leaves edit mode first, then closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmDiscard) return
      guardRef.current(editing ? leaveEditing : onClose)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing, confirmDiscard])

  return (
    <div
      role="dialog"
      aria-label={alt}
      onClick={() => guard(onClose)}
      className="fixed inset-0 z-20 grid place-items-center bg-neutral-900/85 p-5"
    >
      <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {downloadError && <span role="alert" className="text-xs text-danger">{downloadError}</span>}
        <button
          type="button"
          disabled={downloading}
          title="Download image"
          onClick={onDownload}
          className="cursor-pointer rounded-full border border-divider bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
        >
          {downloading ? 'Preparing…' : 'Download'}
        </button>
        {combatPreviewSide && previewFactionId !== undefined && !editing && <GenerationPreview3D imageUrl={src} factionId={previewFactionId} side={combatPreviewSide} title={alt} />}
        {cardPreviewFactionId !== undefined && combatPreviewSide !== 'back' && tools && (
          <button type="button" aria-pressed={asCard} onClick={() => setAsCard((v) => !v)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${asCard ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`}>
            Card preview
          </button>
        )}
        {tools && !asCard && <LayerControls maskSrc={maskSrc} />}
        {compareSrc && tools && (
          <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}
            title="Compare with the image this was edited from"
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${showOriginal ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`}>
            {showOriginal ? 'Showing original' : 'Original'}
          </button>
        )}
        {editTarget?.kind === 'generation' && tools && (
          <button type="button" onClick={() => { setHiding(true); setShowOriginal(false); setNotice(null) }} title="Hide parts of the image on cards, like a layer mask"
            className="cursor-pointer rounded-full border border-divider bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-neutral-800">
            ◧ Hide areas{hasMask ? ' ✓' : ''}
          </button>
        )}
        {editTarget && tools && (
          <button type="button" onClick={() => { setEditing(true); setShowOriginal(false); setNotice(null) }}
            className="cursor-pointer rounded-full border border-divider bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-neutral-800">
            ✎ Edit area
          </button>
        )}
        {favorite && <FavoriteButton target={favorite.target} favorite={favorite.value} variant="pill" />}
        <button
          type="button"
          aria-label="Close"
          onClick={() => guard(onClose)}
          className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-surface text-xl text-ink hover:bg-neutral-800"
        >
          ×
        </button>
      </div>
      {notice && (
        <div role="status" className="absolute top-4 left-4 rounded-md border border-accent/40 bg-surface px-3 py-2 text-xs text-ink"
          onClick={(e) => e.stopPropagation()}>
          {notice}
        </div>
      )}
      {hiding && editTarget?.kind === 'generation' ? (
        <HideMaskEditor src={src} alt={alt} generationId={editTarget.id} hasMask={hasMask} maskSrc={maskSrc}
          cardOverlay={cardPreviewFactionId !== undefined && combatPreviewSide !== 'back' ? { factionId: cardPreviewFactionId, category: cardPreviewCategory ?? 'combat' } : undefined}
          onClose={() => setHiding(false)} onSaved={() => { setHiding(false); setNotice('Mask saved: cards made from this image show it with the hidden areas cut out') }} />
      ) : editing && editTarget ? (
        <AreaEditor src={src} alt={alt} target={editTarget} onDirtyChange={setEditDirty} maskSrc={maskSrc}
          cardOverlay={cardPreviewFactionId !== undefined && combatPreviewSide !== 'back' ? { factionId: cardPreviewFactionId, category: cardPreviewCategory ?? 'combat' } : undefined}
          onCancel={() => guard(leaveEditing)}
          onStarted={(g) => { leaveEditing(); setNotice(`Edit started: ${g.name} — it appears with your other generations`); onEdited?.(g) }} />
      ) : asCard && cardPreviewFactionId !== undefined ? (
        <div onClick={(e) => e.stopPropagation()} className="flex h-[88vh] w-[min(92vw,calc(88vh*0.739))] flex-col">
          <QuickCardPreview imageUrl={editTarget?.kind === 'generation' ? maskedImageUrl(src, editTarget.id, masks.data) : src} factionId={cardPreviewFactionId} cardId={previewCardId} onCardChange={setPreviewCardId} category={cardPreviewCategory} />
        </div>
      ) : (
        <div onClick={(e) => e.stopPropagation()}>
          {(backPreviewCategory || combatPreviewSide === 'back') && previewFactionId !== undefined ? <BackFlatPreview category={backPreviewCategory} factionId={previewFactionId} src={shownSrc} alt={alt} maskSrc={maskSrc} /> : <LayeredImage src={shownSrc} alt={alt} maskSrc={maskSrc} fit="natural"
            imgClassName="max-h-[90vh] max-w-full rounded-md bg-[repeating-conic-gradient(var(--color-accent-700)_0%_25%,var(--color-accent-900)_0%_50%)] bg-[length:20px_20px] object-contain shadow-[0_16px_40px_rgba(0,0,0,0.65)]" />}
        </div>
      )}
      {confirmDiscard && <ConfirmDialog layer="z-30" title="Discard this edit?" body="The painted area and instruction have not been sent."
        confirmLabel="Discard" onConfirm={() => { const leave = confirmDiscard; setConfirmDiscard(null); leaveEditing(); leave() }} onCancel={() => setConfirmDiscard(null)} />}
    </div>
  )
}

// Paint the area to change, describe the change, send it as an area edit.
function AreaEditor({ src, alt, target, onCancel, onStarted, onDirtyChange, maskSrc, cardOverlay }: {
  src: string; alt: string; target: ImageRef; onCancel: () => void; onStarted: (g: Generation) => void; onDirtyChange: (dirty: boolean) => void
  maskSrc?: string | null; cardOverlay?: { factionId: number; category: import('../pages/cards/model').Category }
}) {
  const startEdit = useStartImageEdit()
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [erase, setErase] = useState(false)
  const [brush, setBrush] = useState(60)
  const [instruction, setInstruction] = useState('')
  const [protect, setProtect] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Reference layers over the image while painting; they never change what is sent.
  const [guide, setGuide] = useState(false), [guideOpacity, setGuideOpacity] = useState(0.5)
  const [card, setCard] = useState(false), [cardOpacity, setCardOpacity] = useState(1)
  const [showPaint, setShowPaint] = useState(true)
  const painted = strokes.some((s) => !s.erase)
  const dirty = strokes.length > 0 || instruction.trim() !== ''
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  async function send() {
    if (!size) return
    setSending(true)
    setError(null)
    try {
      const g = await startEdit({ target, mask: painted ? exportMask(size.w, size.h, strokes) : undefined, instruction: instruction.trim(), protect: painted && protect })
      onStarted(g)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'edit failed')
    } finally {
      setSending(false)
    }
  }

  const tool = (on: boolean) => `cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium ${on ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`

  return (
    <div className="flex max-h-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
      <div className="relative">
        <img src={src} alt={alt} draggable={false}
          onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="block max-h-[68vh] max-w-full select-none rounded-md" />
        {guide && maskSrc && <img src={maskSrc} alt="" aria-hidden="true" data-testid="edit-guide" draggable={false} style={{ opacity: guideOpacity }} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />}
        {card && cardOverlay && <CardOverlayLayer imageUrl={src} factionId={cardOverlay.factionId} category={cardOverlay.category} opacity={cardOpacity} />}
        {size && (
          <div className={showPaint ? 'contents' : 'hidden'}><MaskEditor width={size.w} height={size.h} strokes={strokes} erase={erase} brushSize={brush}
            onStroke={(s) => setStrokes((all) => [...all, s])} /></div>
        )}
      </div>
      <div className="flex w-[min(720px,90vw)] flex-col gap-2 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={!erase} onClick={() => setErase(false)} className={tool(!erase)}>Brush</button>
          <button type="button" aria-pressed={erase} onClick={() => setErase(true)} className={tool(erase)}>Eraser</button>
          <label className="flex items-center gap-1.5 text-xs text-ink/60">
            Size
            <input type="range" min={8} max={240} step={4} value={brush} aria-label="Brush size"
              onChange={(e) => setBrush(Number(e.target.value))} className="w-28 accent-[var(--color-accent)]" />
          </label>
          <button type="button" disabled={strokes.length === 0} onClick={() => setStrokes((all) => all.slice(0, -1))}
            className={`${tool(false)} disabled:cursor-not-allowed disabled:opacity-45`}>Undo</button>
          <button type="button" disabled={strokes.length === 0} onClick={() => setStrokes([])}
            className={`${tool(false)} disabled:cursor-not-allowed disabled:opacity-45`}>Clear</button>
          <span className="ml-auto text-[11px] text-ink/45">Paint over the parts to change, or paint nothing to change the whole image</span>
        </div>
        <div role="group" aria-label="Reference layers" className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-ink/50">Show</span>
          <button type="button" aria-pressed={showPaint} onClick={() => setShowPaint((v) => !v)} className={tool(showPaint)}>Paint</button>
          {maskSrc && <button type="button" aria-pressed={guide} onClick={() => setGuide((v) => !v)} className={tool(guide)}>Template guide</button>}
          {guide && maskSrc && <input type="range" min={0.1} max={1} step={0.05} value={guideOpacity} aria-label="Template guide opacity" onChange={(e) => setGuideOpacity(Number(e.target.value))} className="w-24 accent-[var(--color-accent)]" />}
          {cardOverlay && <button type="button" aria-pressed={card} onClick={() => setCard((v) => !v)} className={tool(card)}>Card overlay</button>}
          {card && cardOverlay && <input type="range" min={0.1} max={1} step={0.05} value={cardOpacity} aria-label="Card overlay opacity" onChange={(e) => setCardOpacity(Number(e.target.value))} className="w-24 accent-[var(--color-accent)]" />}
        </div>
        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-label="Edit instruction"
          placeholder="What should change? e.g. replace the skull with a cog emblem (in the painted area), or make everything darker (nothing painted)"
          className="min-h-16 w-full resize-y rounded-md border border-divider bg-bg px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink/70" title="Paste the original pixels back everywhere you didn't paint">
            <input type="checkbox" checked={protect && painted} disabled={!painted} onChange={(e) => setProtect(e.target.checked)} />
            Keep unpainted area exactly as is
          </label>
          {error && <span role="alert" className="text-xs text-danger">{error}</span>}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} className={tool(false)}>Cancel</button>
            <button type="button" disabled={!instruction.trim() || sending || !size} title={painted ? undefined : 'Nothing is painted: the whole image is changed'} onClick={send}
              className="cursor-pointer rounded-md border border-accent bg-transparent px-3 py-1 text-xs font-medium text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-45">
              {sending ? 'Sending…' : 'Send edit'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

// Wraps a thumbnail in a button that opens the image in an ImageLightbox.
export function ZoomableImage({
  src, alt, maskSrc, cardPreviewFactionId, cardPreviewCategory, combatPreviewSide, previewFactionId, backPreviewCategory, downloadName, favorite, editTarget, compareSrc, onEdited, className, children,
}: {
  src: string; alt: string; maskSrc?: string | null; cardPreviewFactionId?: number; downloadName?: string
  favorite?: FavoriteProp; className?: string; children: ReactNode
} & EditProps & CombatPreviewProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={`Open ${alt}`}
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in border-0 bg-transparent p-0 ${className ?? ''}`}
      >
        {children}
      </button>
      {open && <ImageLightbox src={src} alt={alt} maskSrc={maskSrc} cardPreviewFactionId={cardPreviewFactionId} cardPreviewCategory={cardPreviewCategory} combatPreviewSide={combatPreviewSide} previewFactionId={previewFactionId} backPreviewCategory={backPreviewCategory} downloadName={downloadName} favorite={favorite}
        editTarget={editTarget} compareSrc={compareSrc} onEdited={onEdited} onClose={() => setOpen(false)} />}
    </>
  )
}

// A round button that opens the image straight in hide-areas mode (a layer mask kept apart from the image).
export function HideAreasButton({ src, alt, target, maskSrc, cardPreviewFactionId, cardPreviewCategory }: { src: string; alt: string; target: ImageRef; maskSrc?: string | null; cardPreviewFactionId?: number; cardPreviewCategory?: import('../pages/cards/model').Category }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-label="Hide areas" title="Hide areas of the image on cards, like a layer mask" onClick={() => setOpen(true)}
        className="grid size-8 cursor-pointer place-items-center rounded-full border border-divider bg-surface text-ink hover:bg-neutral-800">
        <MaskIcon />
      </button>
      {open && <ImageLightbox src={src} alt={alt} editTarget={target} maskSrc={maskSrc} cardPreviewFactionId={cardPreviewFactionId} cardPreviewCategory={cardPreviewCategory} startHiding onClose={() => setOpen(false)} />}
    </>
  )
}

// A round pen button that opens the image straight in area-edit mode.
export function EditImageButton({ src, alt, target, compareSrc, onEdited, maskSrc, cardPreviewFactionId, cardPreviewCategory }: { src: string; alt: string; target: ImageRef; compareSrc?: string | null; onEdited?: (g: Generation) => void; maskSrc?: string | null; cardPreviewFactionId?: number; cardPreviewCategory?: import('../pages/cards/model').Category }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-label="Edit area" title="Edit area" onClick={() => setOpen(true)}
        className="grid size-8 cursor-pointer place-items-center rounded-full border border-divider bg-surface text-ink hover:bg-neutral-800">
        <EditIcon />
      </button>
      {open && <ImageLightbox src={src} alt={alt} editTarget={target} compareSrc={compareSrc} maskSrc={maskSrc} cardPreviewFactionId={cardPreviewFactionId} cardPreviewCategory={cardPreviewCategory} onEdited={onEdited} startEditing onClose={() => setOpen(false)} />}
    </>
  )
}
