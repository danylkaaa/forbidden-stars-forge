export const DPI_OPTIONS = [150, 200, 300, 600]
export const DEFAULT_DPI = 300

const MM_PER_INCH = 25.4

export const mmToPx = (mm: number, dpi: number) => Math.round((mm / MM_PER_INCH) * dpi)
export const pxToMm = (px: number, dpi: number) => Math.round(((px / dpi) * MM_PER_INCH) * 100) / 100

// "816x1104" → { w: 816, h: 1104 }; anything else (empty, "auto") → null.
export function parseSize(size: string): { w: number; h: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(size.trim())
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null
}

// OpenAI accepts only sizes whose sides are both divisible by 16.
export const SIZE_STEP = 16
export const roundToStep = (px: number) => Math.max(SIZE_STEP, Math.round(px / SIZE_STEP) * SIZE_STEP)

// Limits of OpenAI's flexible sizes for the gpt-image-2 models. Divisibility, ratio and the 3840x2160 maximum are
// documented; the minimum is the API's "minimum pixel budget" (the docs give no number, so this is its smallest accepted size).
export const MIN_PIXELS = 655_360
export const MAX_PIXELS = 3840 * 2160
export const MAX_EDGE = 3840
export const MAX_RATIO = 3

// Why a "<width>x<height>" size cannot be sent to OpenAI; null when it is fine or empty (empty follows the template).
export function sizeError(size: string): string | null {
  if (size.trim() === '') return null
  const s = parseSize(size)
  if (!s || s.w <= 0 || s.h <= 0) return 'Enter both a width and a height.'
  if (s.w % SIZE_STEP || s.h % SIZE_STEP) return `OpenAI needs width and height divisible by ${SIZE_STEP}.`
  if (s.w * s.h < MIN_PIXELS) return `Too small: OpenAI needs at least ${MIN_PIXELS.toLocaleString('en-US')} pixels (this is ${(s.w * s.h).toLocaleString('en-US')}). Raise the DPI or the size.`
  if (s.w * s.h > MAX_PIXELS || Math.max(s.w, s.h) > MAX_EDGE) return `Too large: at most 3840×2160 pixels.`
  if (Math.max(s.w, s.h) / Math.min(s.w, s.h) > MAX_RATIO) return 'The aspect ratio must be between 1:3 and 3:1.'
  return null
}

// The nearest valid size with the same shape (ratio clamped to 1:3–3:1): scaled up or down until its pixel
// count fits the limits, with both sides divisible by 16. Null when the input is not a size or nothing fits.
export function suggestSize(size: string): { w: number; h: number } | null {
  const s = parseSize(size)
  if (!s || s.w <= 0 || s.h <= 0) return null
  const ratio = Math.min(MAX_RATIO, Math.max(1 / MAX_RATIO, s.w / s.h))
  const target = Math.min(MAX_PIXELS, Math.max(MIN_PIXELS, s.w * s.h))
  let h = Math.sqrt(target / ratio)
  for (let i = 0; i < 200; i++) {
    const w2 = roundToStep(h * ratio), h2 = roundToStep(h)
    if (sizeError(`${w2}x${h2}`) === null) return { w: w2, h: h2 }
    h *= w2 * h2 < MIN_PIXELS ? 1.01 : 0.99
  }
  return null
}

// The edge an element's size is worked out from: its longer side.
export const RATIO_LONG_EDGE = 1536

// The size for an aspect ratio (width : height): the longer side is RATIO_LONG_EDGE, the other follows, both
// divisible by 16. Null when the ratio is not a positive number or is outside 1:3–3:1.
export function sizeForRatio(w: number, h: number): { w: number; h: number } | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  const ratio = w / h
  if (ratio > MAX_RATIO || ratio < 1 / MAX_RATIO) return null
  const size = ratio >= 1 ? { w: RATIO_LONG_EDGE, h: roundToStep(RATIO_LONG_EDGE / ratio) } : { w: roundToStep(RATIO_LONG_EDGE * ratio), h: RATIO_LONG_EDGE }
  return sizeError(`${size.w}x${size.h}`) === null ? size : null
}

// The widest shape an element may have; beyond the model's 3:1 the picture is made 3:1 and cropped.
export const MAX_ELEMENT_RATIO = 20

// The size to ask the model for, and the shape to crop the result to ('' when it is the size's own shape), for an
// aspect ratio width : height between 1:20 and 20:1. Null for anything else.
export function sizeAndAspect(w: number, h: number): { size: { w: number; h: number }; aspect: string } | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  const ratio = w / h
  if (ratio > MAX_ELEMENT_RATIO || ratio < 1 / MAX_ELEMENT_RATIO) return null
  if (ratio <= MAX_RATIO && ratio >= 1 / MAX_RATIO) { const size = sizeForRatio(w, h); return size ? { size, aspect: '' } : null }
  const size = sizeForRatio(ratio > 1 ? MAX_RATIO : 1, ratio > 1 ? 1 : MAX_RATIO)
  return size ? { size, aspect: String(Math.round(ratio * 10000) / 10000) } : null
}

// A size as a short "W : H" ratio: reduced when that stays small ("3:1"), else to one decimal against 1.
export function ratioOf(size: string): { w: string; h: string } {
  const s = parseSize(size)
  if (!s || s.w <= 0 || s.h <= 0) return { w: '', h: '' }
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  const g = gcd(s.w, s.h), rw = s.w / g, rh = s.h / g
  if (rw <= 32 && rh <= 32) return { w: String(rw), h: String(rh) }
  const r = s.w / s.h
  return r >= 1 ? { w: String(Math.round(r * 100) / 100), h: '1' } : { w: '1', h: String(Math.round(100 / r) / 100) }
}
