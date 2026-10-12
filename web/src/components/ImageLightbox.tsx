import { useEffect, useState, type ReactNode } from 'react'
import { LayerControls, LayeredImage } from './PreviewLayers'
import { FavoriteButton } from './FavoriteButton'
import type { ImageRef } from '../lib/favorites'
import { useStartImageEdit } from '../lib/imageEdits'
import type { Generation } from '../pages/test-generation/api'
import { MaskEditor } from './MaskEditor'
import { exportMask, type Stroke } from '../lib/mask'
import { QuickCardPreview } from '../pages/assemble/QuickCardPreview'
import { GenerationPreview3D } from '../pages/assemble/GenerationPreview3D'
import { BackLogoFlatPreview } from '../pages/assemble/BackLogoPreview'

type CombatPreviewProps = { backPreviewCategory?: import('../pages/cards/model').Category; combatPreviewSide?: 'front' | 'back'; previewFactionId?: number }

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
  src, alt, maskSrc, cardPreviewFactionId, combatPreviewSide, previewFactionId, backPreviewCategory, downloadName, favorite, editTarget, compareSrc, onEdited, onClose,
}: {
  src: string; alt: string; maskSrc?: string | null; cardPreviewFactionId?: number
  downloadName?: string // file name without extension; defaults to a slug of alt
  favorite?: FavoriteProp
  onClose: () => void
} & EditProps & CombatPreviewProps) {
  const [asCard, setAsCard] = useState(false)
  const [previewCardId, setPreviewCardId] = useState(0)
  const [editing, setEditing] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const shownSrc = showOriginal && compareSrc ? compareSrc : src
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

  // Escape leaves edit mode first, then closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editing) setEditing(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  return (
    <div
      role="dialog"
      aria-label={alt}
      onClick={onClose}
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
        {cardPreviewFactionId !== undefined && combatPreviewSide !== 'back' && !editing && (
          <button type="button" aria-pressed={asCard} onClick={() => setAsCard((v) => !v)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${asCard ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`}>
            Card preview
          </button>
        )}
        {!editing && !asCard && <LayerControls maskSrc={maskSrc} />}
        {compareSrc && !editing && (
          <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}
            title="Compare with the image this was edited from"
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${showOriginal ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`}>
            {showOriginal ? 'Showing original' : 'Original'}
          </button>
        )}
        {editTarget && !editing && (
          <button type="button" onClick={() => { setEditing(true); setShowOriginal(false); setNotice(null) }}
            className="cursor-pointer rounded-full border border-divider bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-neutral-800">
            ✎ Edit area
          </button>
        )}
        {favorite && <FavoriteButton target={favorite.target} favorite={favorite.value} variant="pill" />}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
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
      {editing && editTarget ? (
        <AreaEditor src={src} alt={alt} target={editTarget}
          onCancel={() => setEditing(false)}
          onStarted={(g) => { setEditing(false); setNotice(`Edit started: ${g.name} — it appears with your other generations`); onEdited?.(g) }} />
      ) : asCard && cardPreviewFactionId !== undefined ? (
        <div onClick={(e) => e.stopPropagation()} className="flex h-[88vh] w-[min(92vw,calc(88vh*0.739))] flex-col">
          <QuickCardPreview imageUrl={src} factionId={cardPreviewFactionId} cardId={previewCardId} onCardChange={setPreviewCardId} />
        </div>
      ) : (
        <div onClick={(e) => e.stopPropagation()}>
          {(backPreviewCategory || combatPreviewSide === 'back') && previewFactionId !== undefined ? <BackLogoFlatPreview category={backPreviewCategory} factionId={previewFactionId} src={shownSrc} alt={alt} maskSrc={maskSrc}
            imgClassName="max-h-[80vh] max-w-full rounded-md object-contain" /> : <LayeredImage src={shownSrc} alt={alt} maskSrc={maskSrc} fit="natural"
            imgClassName="max-h-[90vh] max-w-full rounded-md bg-[repeating-conic-gradient(var(--color-accent-700)_0%_25%,var(--color-accent-900)_0%_50%)] bg-[length:20px_20px] object-contain shadow-[0_16px_40px_rgba(0,0,0,0.65)]" />}
        </div>
      )}
    </div>
  )
}

// Paint the area to change, describe the change, send it as an area edit.
function AreaEditor({ src, alt, target, onCancel, onStarted }: {
  src: string; alt: string; target: ImageRef; onCancel: () => void; onStarted: (g: Generation) => void
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
  const painted = strokes.some((s) => !s.erase)

  async function send() {
    if (!size) return
    setSending(true)
    setError(null)
    try {
      const g = await startEdit({ target, mask: exportMask(size.w, size.h, strokes), instruction: instruction.trim(), protect })
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
        {size && (
          <MaskEditor width={size.w} height={size.h} strokes={strokes} erase={erase} brushSize={brush}
            onStroke={(s) => setStrokes((all) => [...all, s])} />
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
          <span className="ml-auto text-[11px] text-ink/45">Paint over the parts to change</span>
        </div>
        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-label="Edit instruction"
          placeholder="What should change in the painted area? e.g. replace the skull with a cog emblem"
          className="min-h-16 w-full resize-y rounded-md border border-divider bg-bg px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink/70" title="Paste the original pixels back everywhere you didn't paint">
            <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />
            Keep unpainted area exactly as is
          </label>
          {error && <span role="alert" className="text-xs text-danger">{error}</span>}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} className={tool(false)}>Cancel</button>
            <button type="button" disabled={!painted || !instruction.trim() || sending || !size} onClick={send}
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
  src, alt, maskSrc, cardPreviewFactionId, combatPreviewSide, previewFactionId, backPreviewCategory, downloadName, favorite, editTarget, compareSrc, onEdited, className, children,
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
      {open && <ImageLightbox src={src} alt={alt} maskSrc={maskSrc} cardPreviewFactionId={cardPreviewFactionId} combatPreviewSide={combatPreviewSide} previewFactionId={previewFactionId} backPreviewCategory={backPreviewCategory} downloadName={downloadName} favorite={favorite}
        editTarget={editTarget} compareSrc={compareSrc} onEdited={onEdited} onClose={() => setOpen(false)} />}
    </>
  )
}
