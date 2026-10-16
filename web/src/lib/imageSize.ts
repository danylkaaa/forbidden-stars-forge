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
