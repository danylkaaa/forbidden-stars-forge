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
// `bottomInset` lifts the whole stack off the image's bottom edge: the part of
// the image beyond the cut line is bleed, and the bottom border must sit inside the cut card.
export function combatPanels(width: number, height: number, bottomHeight: number, upper: TextBlock, lower: TextBlock, insets: PanelInsets = NO_INSETS, bottomInset = 0) {
  // Padding above and below each block, as a percentage of card width.
  const padTop = (b: TextBlock) => width * (b.placement.paddingTop ?? 4) / 100
  const padBottom = (b: TextBlock) => width * (b.placement.paddingBottom ?? 4) / 100
  const upperPad = padTop(upper), lowerPad = padTop(lower)
  const hasUpper = !!upper.text.trim(), hasLower = !!lower.text.trim()
  const upperHeight = hasUpper ? upper.height : 0, lowerHeight = hasLower ? lower.height : 0
  const bottomY = height - bottomInset - bottomHeight
  const defaults = defaultLayout()
  const isAuto = (p: Placement, key: 'upper_text' | 'lower_text') => p.autoY ?? p.y === defaults[key].y
  const lowerAuto = isAuto(lower.placement, 'lower_text'), upperAuto = isAuto(upper.placement, 'upper_text')
  const foregroundY = !hasLower ? null
    : lowerAuto ? bottomY - (insets.foreground + lowerPad + padBottom(lower) + lowerHeight)
    : lower.placement.y * height / 100 - lowerPad - insets.foreground
  const lowerY = foregroundY !== null && lowerAuto ? foregroundY + insets.foreground + lowerPad : lower.placement.y * height / 100
  const upperEnd = foregroundY !== null ? foregroundY + insets.dividerTop : bottomY
  const upperTop = upperEnd - (insets.background + upperPad + padBottom(upper) + upperHeight)
  const upperY = upperAuto ? upperTop + insets.background + upperPad : upper.placement.y * height / 100
  const backgroundY = hasUpper ? Math.min(upperTop, upperY - upperPad - insets.background) : foregroundY
  const end = Math.max(hasUpper ? upperY + upperHeight : 0, hasLower ? lowerY + lowerHeight : 0)
  return {
    backgroundY, foregroundY, bottomY,
    upperY, lowerY,
    overflow: end > bottomY || (backgroundY !== null && backgroundY < 0),
    overlap: hasUpper && hasLower && foregroundY !== null && upperY + upperHeight > upperEnd,
  }
}
