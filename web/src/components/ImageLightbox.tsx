import { useEffect, useState, type ReactNode } from 'react'
import { usePreviewLayers } from '../lib/previewLayers'
import { LayerControls, LayeredImage } from './PreviewLayers'
import { FavoriteButton } from './FavoriteButton'
import type { ImageRef } from '../lib/favorites'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load ${src}`))
    img.src = src
  })
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Downloads what the preview shows: the raw image, or — with the overlay
// on — the image with the overlay composited at the image's native size.
async function downloadImage(src: string, overlaySrc: string | null, filename: string) {
  if (!overlaySrc) {
    saveBlob(await (await fetch(src)).blob(), filename)
    return
  }
  const [base, overlay] = await Promise.all([loadImage(src), loadImage(overlaySrc)])
  const canvas = document.createElement('canvas')
  canvas.width = base.naturalWidth
  canvas.height = base.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(base, 0, 0)
  ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height) // stretched, like the preview
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('could not encode PNG')
  saveBlob(blob, filename)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'image'

// The image's favorite state, when it can be starred from the popup.
export type FavoriteProp = { target: ImageRef; value: boolean }

// Full-size image popup. Closes on backdrop click, the × button, or Escape.
// The purple checkerboard behind the image shows real alpha transparency;
// a grey/white checkerboard means the model painted one into the pixels.
// Overlay/mask layers and their toggles come from PreviewLayers; Download
// includes the overlay when it's on (never the mask, a diagnostic aid).
export function ImageLightbox({
  src, alt, overlaySrc, maskSrc, downloadName, favorite, onClose,
}: {
  src: string; alt: string; overlaySrc?: string | null; maskSrc?: string | null
  downloadName?: string // file name without extension; defaults to a slug of alt
  favorite?: FavoriteProp
  onClose: () => void
}) {
  const showOverlay = usePreviewLayers((s) => s.overlay)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const overlayOn = Boolean(overlaySrc) && showOverlay

  async function onDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadImage(src, overlayOn ? overlaySrc! : null, `${downloadName || slug(alt)}${overlayOn ? '_overlay' : ''}.png`)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'download failed')
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
          title={overlayOn ? 'Download with overlay' : 'Download image'}
          onClick={onDownload}
          className="cursor-pointer rounded-full border border-divider bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
        >
          {downloading ? 'Preparing…' : overlayOn ? 'Download (with overlay)' : 'Download'}
        </button>
        <LayerControls overlaySrc={overlaySrc} maskSrc={maskSrc} />
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
      <div onClick={(e) => e.stopPropagation()}>
        <LayeredImage src={src} alt={alt} overlaySrc={overlaySrc} maskSrc={maskSrc} fit="natural"
          imgClassName="max-h-[90vh] max-w-full rounded-md bg-[repeating-conic-gradient(#5d5294_0%_25%,#2b2741_0%_50%)] bg-[length:20px_20px] object-contain shadow-[0_16px_40px_rgba(0,0,0,0.65)]" />
      </div>
    </div>
  )
}

// Wraps a thumbnail in a button that opens the image in an ImageLightbox.
export function ZoomableImage({
  src, alt, overlaySrc, maskSrc, downloadName, favorite, className, children,
}: {
  src: string; alt: string; overlaySrc?: string | null; maskSrc?: string | null; downloadName?: string
  favorite?: FavoriteProp; className?: string; children: ReactNode
}) {
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
      {open && <ImageLightbox src={src} alt={alt} overlaySrc={overlaySrc} maskSrc={maskSrc} downloadName={downloadName} favorite={favorite} onClose={() => setOpen(false)} />}
    </>
  )
}
