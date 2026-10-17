import { isNeutralAdjust, type ArtworkAdjust } from './artwork'
import { adjustPixels } from './artworkAdjust'

// A template's tone and colour correction travels with its address, after a '#' (which is never sent to the server), so
// every place that draws the image from its address draws the corrected one without knowing about corrections.
const MARK = '#adjust='

export function withAdjust(url: string, adjust?: ArtworkAdjust) {
  return isNeutralAdjust(adjust) ? url : `${url}${MARK}${encodeURIComponent(JSON.stringify(adjust))}`
}

const made = new Map<string, Promise<string>>()

// The address to load the image from: itself, or for a corrected one an object address of the corrected picture.
export function resolveImageSrc(url: string): Promise<string> {
  const at = url.indexOf(MARK)
  if (at < 0) return Promise.resolve(url)
  let known = made.get(url)
  if (!known) {
    known = correct(url.slice(0, at), JSON.parse(decodeURIComponent(url.slice(at + MARK.length))) as ArtworkAdjust)
    if (made.size >= 24) {
      // Sliders make a new picture at every stop; let go of the oldest.
      const [oldest, address] = made.entries().next().value!
      made.delete(oldest); void address.then(src => { if (src.startsWith('blob:')) URL.revokeObjectURL(src) })
    }
    made.set(url, known); known.catch(() => made.delete(url))
  }
  return known
}

// Live previews while a slider moves: the picture is decoded and scaled down once, then each change only corrects a copy
// of those pixels and paints them straight onto a canvas (no encoding, no image decoding).
const bases = new Map<string, Promise<ImageData>>()
export function previewBase(source: string, maxWidth: number): Promise<ImageData> {
  const key = `${maxWidth}|${source}`
  let known = bases.get(key)
  if (!known) {
    if (bases.size >= 8) bases.delete(bases.keys().next().value!)
    known = scaledPixels(source, maxWidth)
    bases.set(key, known); known.catch(() => bases.delete(key))
  }
  return known
}
export function paintPreview(canvas: HTMLCanvasElement, base: ImageData, adjust: ArtworkAdjust) {
  canvas.width = base.width; canvas.height = base.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
  adjustPixels(copy.data, base.width, base.height, adjust)
  ctx.putImageData(copy, 0, 0)
}

async function loadPixels(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el); el.onerror = () => reject(new Error('Could not load the image to adjust.'))
    el.src = source
  })
}
async function scaledPixels(source: string, maxWidth: number) {
  const img = await loadPixels(source), shrink = Math.min(1, maxWidth / img.naturalWidth)
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * shrink); canvas.height = Math.round(img.naturalHeight * shrink)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

async function correct(source: string, adjust: ArtworkAdjust) {
  const img = await loadPixels(source)
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  adjustPixels(pixels.data, canvas.width, canvas.height, adjust)
  ctx.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  return blob ? URL.createObjectURL(blob) : source
}
