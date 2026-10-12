import { defaultLayout, type Placement } from './model'

type TextBlock = { text: string; height: number; placement: Placement }
// Output pixels taken by the textures' decorative top edges: the parchment's
// border, the transparent strip above the divider bar, and the bar itself.
export type PanelInsets = { background: number; dividerTop: number; foreground: number }
const NO_INSETS: PanelInsets = { background: 0, dividerTop: 0, foreground: 0 }
// All dimensions are output pixels. Text heights come from the same wrapped
// runs used by the painter, including font size, line spacing, and icon widths.
// Each auto-placed block is centred in the visible parchment of its panel:
// equal padding above (below the border/bar) and below (to the divider bar or
// the bottom decoration).
export function combatPanels(width: number, height: number, bottomHeight: number, upper: TextBlock, lower: TextBlock, insets: PanelInsets = NO_INSETS) {
  const padding = width * .04
  const hasUpper = !!upper.text.trim(), hasLower = !!lower.text.trim()
  const upperHeight = hasUpper ? upper.height : 0, lowerHeight = hasLower ? lower.height : 0
  const bottomY = height - bottomHeight
  const defaults = defaultLayout()
  const isAuto = (p: Placement, key: 'upper_text' | 'lower_text') => p.autoY ?? p.y === defaults[key].y
  const lowerAuto = isAuto(lower.placement, 'lower_text'), upperAuto = isAuto(upper.placement, 'upper_text')
  const foregroundY = !hasLower ? null
    : lowerAuto ? bottomY - (insets.foreground + padding * 2 + lowerHeight)
    : lower.placement.y * height / 100 - padding - insets.foreground
  const lowerY = foregroundY !== null && lowerAuto ? foregroundY + insets.foreground + padding : lower.placement.y * height / 100
  const upperEnd = foregroundY !== null ? foregroundY + insets.dividerTop : bottomY
  const upperTop = upperEnd - (insets.background + padding * 2 + upperHeight)
  const upperY = upperAuto ? upperTop + insets.background + padding : upper.placement.y * height / 100
  const backgroundY = hasUpper ? Math.min(upperTop, upperY - padding - insets.background) : foregroundY
  const end = Math.max(hasUpper ? upperY + upperHeight : 0, hasLower ? lowerY + lowerHeight : 0)
  return {
    backgroundY, foregroundY, bottomY,
    upperY, lowerY,
    overflow: end > bottomY || (backgroundY !== null && backgroundY < 0),
    overlap: hasUpper && hasLower && foregroundY !== null && upperY + upperHeight > upperEnd,
  }
}
