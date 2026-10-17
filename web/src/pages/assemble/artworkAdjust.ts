import { fullAdjust, type ArtworkAdjust, type FullAdjust } from './artwork'

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
const index = (v: number) => v < 0 ? 0 : v > 255 ? 255 : Math.round(v)

// Levels, brightness and contrast as one lookup per channel value.
function toneTable(a: FullAdjust) {
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

// Rotates the hue around the grey axis (the standard RGB hue matrix).
function hueMatrix(degrees: number) {
  const rad = degrees * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
  return [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ]
}

// Corrects RGBA pixels in place; alpha is untouched.
export function adjustPixels(data: Uint8ClampedArray, w: number, h: number, adjust: ArtworkAdjust) {
  const a = fullAdjust(adjust)
  if (a.sharpness > 0) sharpen(data, w, h, a.sharpness)
  const table = toneTable(a), sat = 1 + a.saturation / 100, vibrance = a.vibrance / 100
  const warm = a.temperature / 100 * 0.25, tint = a.tint / 100 * 0.25
  const shadows = a.shadows / 100 * 0.4, highlights = a.highlights / 100 * 0.4
  const hue = a.hue !== 0 ? hueMatrix(a.hue) : null
  const vignette = a.vignette / 100, cx = (w - 1) / 2, cy = (h - 1) / 2, reach = Math.hypot(cx, cy) || 1
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2]
    if (warm !== 0 || tint !== 0) { r *= 1 + warm + tint / 2; g *= 1 - tint; b *= 1 - warm + tint / 2 }
    r = table[index(r)]; g = table[index(g)]; b = table[index(b)]
    if (shadows !== 0 || highlights !== 0) {
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const lift = (shadows * (1 - l) * (1 - l) + highlights * l * l) * 255
      r += lift; g += lift; b += lift
    }
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    let factor = sat
    if (vibrance !== 0) {
      const top = Math.max(r, g, b), saturation = top > 0 ? (top - Math.min(r, g, b)) / top : 0
      // Muted colours move most, already vivid ones barely.
      factor *= 1 + vibrance * (1 - saturation)
    }
    r = gray + (r - gray) * factor; g = gray + (g - gray) * factor; b = gray + (b - gray) * factor
    if (hue) {
      const nr = hue[0] * r + hue[1] * g + hue[2] * b, ng = hue[3] * r + hue[4] * g + hue[5] * b, nb = hue[6] * r + hue[7] * g + hue[8] * b
      r = nr; g = ng; b = nb
    }
    if (vignette !== 0) {
      const p = i / 4, d = Math.hypot(p % w - cx, Math.floor(p / w) - cy) / reach
      const edge = clamp01((d - 0.35) / 0.75), t = edge * edge * (3 - 2 * edge)
      if (vignette < 0) { const k = 1 + vignette * t; r *= k; g *= k; b *= k }
      else { const k = vignette * t; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k }
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b
  }
}
