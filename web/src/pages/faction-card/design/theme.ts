// One primary colour drives every colour of the faction card's panels, outlines and corner
// squares. Everything else is derived from its hue and saturation.
export const DEFAULT_THEME_COLOR = '#f3df5e'
export const THEME_PRESETS = [
  { name: 'Gold', color: '#f3df5e' }, { name: 'Lime', color: '#c9e65a' }, { name: 'Green', color: '#62d06f' }, { name: 'Red', color: '#e8625c' },
  { name: 'Blue', color: '#62a4ec' }, { name: 'Purple', color: '#ac7ee6' }, { name: 'Orange', color: '#f29d3e' }, { name: 'Teal', color: '#4fcdc3' },
] as const

export type CardTheme = {
  base: string       // card and circle fill
  mid: string        // peak of the screen / banner gradient
  pale: string       // near-white ends of that gradient, tinted with the hue
  outline: string    // own border and outer border
  frame: string      // solid border of the objective picture frames
  corner: string; cornerGlow: string; cornerEdge: string
  fillShadow: string // inner shadow of the unit circles
  hue: number        // degrees the yellow light-bar artwork is turned by
}

export const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

// The card's theme colour: its own setting, else the faction's unit colour, else gold.
export function themeColor(theme: string | undefined, unitColor: string | undefined): string {
  if (isHex(theme)) return theme.toLowerCase()
  if (isHex(unitColor)) return unitColor.toLowerCase()
  return DEFAULT_THEME_COLOR
}

export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  let h = 0, s = 0
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  }
  return [h, s * 100, l * 100]
}

const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)))
export type ThemeOverrides = { panel?: string; frame?: string; light?: string }
export function deriveTheme(hex: string, over: ThemeOverrides = {}): CardTheme {
  const [h, s] = hexToHsl(isHex(hex) ? hex : DEFAULT_THEME_COLOR), H = Math.round(h)
  const hsl = (sat: number, light: number, alpha = 1) => `hsla(${H}, ${clamp(sat)}%, ${light}%, ${alpha})`
  // A chosen panel colour is the light panels' peak colour; their near-white ends take its hue.
  const [ph, ps] = isHex(over.panel) ? hexToHsl(over.panel) : [h, s]
  const panelEnds = `hsla(${Math.round(ph)}, ${clamp(ps * .55 + 22)}%, 96%, 1)`
  return {
    base: isHex(hex) ? hex : DEFAULT_THEME_COLOR,
    mid: isHex(over.panel) ? over.panel : hsl(s + 14, 83), pale: isHex(over.panel) ? panelEnds : hsl(s * .55 + 22, 96), outline: hsl(s * .8, 69), frame: isHex(over.frame) ? over.frame : hsl(s * .8, 69),
    corner: hsl(s + 14, 67), cornerGlow: hsl(s + 14, 67, .7), cornerEdge: hsl(s * .6, 32),
    fillShadow: hsl(Math.max(s, 50), 24, .55),
    // the light-bar artwork is yellow (hue 52): turned to the chosen light colour, else to the theme's hue
    hue: (isHex(over.light) ? hexToHsl(over.light)[0] : h) - 52,
  }
}
