import { useEffect, useState } from 'react'

// A rendered card (or card back) as JPEG bytes for the PDF plus a blob URL
// for the on-screen preview.
export type PrintAsset = { jpeg: Uint8Array; width: number; height: number; url: string }

// `size` resamples to the pixel dimensions the card needs at print resolution.
export async function canvasAsset(source: HTMLCanvasElement, size?: { width: number; height: number }): Promise<PrintAsset> {
  // JPEG has no transparency; the rounded corners print as white paper.
  const flat = document.createElement('canvas'); flat.width = size?.width ?? source.width; flat.height = size?.height ?? source.height
  const ctx = flat.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create a canvas.')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, flat.width, flat.height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, flat.width, flat.height)
  const blob = await new Promise<Blob>((resolve, reject) => flat.toBlob(b => b ? resolve(b) : reject(new Error('JPEG export failed.')), 'image/jpeg', 0.95))
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: flat.width, height: flat.height, url: URL.createObjectURL(blob) }
}

function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not load the card back image.'))
    img.src = url
  })
}
// Mirrors BackImage: the image covers the card, the logo is contained in a
// centred square of `scale` × the card width and height.
export async function renderBack(url: string, logoUrl: string | undefined, scale: number): Promise<HTMLCanvasElement> {
  const [img, logo] = await Promise.all([load(url), logoUrl ? load(logoUrl) : null])
  const canvas = document.createElement('canvas'); canvas.width = 816; canvas.height = 1104
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create a canvas.')
  const cover = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
  ctx.drawImage(img, (canvas.width - img.naturalWidth * cover) / 2, (canvas.height - img.naturalHeight * cover) / 2, img.naturalWidth * cover, img.naturalHeight * cover)
  if (logo) {
    const bw = canvas.width * scale, bh = canvas.height * scale, fit = Math.min(bw / logo.naturalWidth, bh / logo.naturalHeight)
    ctx.drawImage(logo, (canvas.width - logo.naturalWidth * fit) / 2, (canvas.height - logo.naturalHeight * fit) / 2, logo.naturalWidth * fit, logo.naturalHeight * fit)
  }
  return canvas
}

export function useBackAsset(url: string | undefined, logoUrl: string | undefined, scale: number | undefined, size: { width: number; height: number }) {
  const [state, setState] = useState<{ asset: PrintAsset | null; error: string }>({ asset: null, error: '' })
  useEffect(() => {
    if (!url) { setState({ asset: null, error: '' }); return }
    let cancelled = false, made: PrintAsset | null = null
    renderBack(url, logoUrl, scale ?? 0.5).then(canvas => canvasAsset(canvas, size)).then(asset => {
      if (cancelled) URL.revokeObjectURL(asset.url); else { made = asset; setState({ asset, error: '' }) }
    }).catch(e => { if (!cancelled) setState({ asset: null, error: e instanceof Error ? e.message : 'Could not render the card back.' }) })
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made.url) }
  }, [url, logoUrl, scale, size])
  return state
}
