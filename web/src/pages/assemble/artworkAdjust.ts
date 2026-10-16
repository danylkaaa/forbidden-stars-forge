import type { ArtworkAdjust } from './artwork'

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v

// Levels, brightness and contrast as one lookup per channel value.
function toneTable(a: ArtworkAdjust) {
  const table = new Uint8ClampedArray(256), span = Math.max(1, a.white - a.black) / 255
  const contrast = a.contrast >= 0 ? 1 + a.contrast / 100 * 2 : 1 + a.contrast / 100
  for (let i = 0; i < 256; i++) {
    let v = clamp01((i / 255 - a.black / 255) / span)
    v = Math.pow(v, 1 / Math.max(0.01, a.gamma))
    v = clamp01(v + a.brightness / 100 * 0.5)
    v = clamp01((v - 0.5) * contrast + 0.5)
    table[i] = Math.round(v * 255)
  }
  return table
}

// Unsharp mask: adds back the difference from a 3 × 3 blur.
function sharpen(data: Uint8ClampedArray, w: number, h: number, amount: number) {
  const src = new Uint8ClampedArray(data), k = amount / 100 * 1.5
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        sum += src[(Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))) * 4 + c]
      }
      data[o + c] = src[o + c] + k * (src[o + c] - sum / 9)
    }
  }
}

// Corrects RGBA pixels in place; alpha is untouched.
export function adjustPixels(data: Uint8ClampedArray, w: number, h: number, a: ArtworkAdjust) {
  if (a.sharpness > 0) sharpen(data, w, h, a.sharpness)
  const table = toneTable(a), sat = a.saturation >= 0 ? 1 + a.saturation / 100 : 1 + a.saturation / 100
  for (let i = 0; i < data.length; i += 4) {
    const r = table[data[i]], g = table[data[i + 1]], b = table[data[i + 2]]
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    data[i] = gray + (r - gray) * sat; data[i + 1] = gray + (g - gray) * sat; data[i + 2] = gray + (b - gray) * sat
  }
}
