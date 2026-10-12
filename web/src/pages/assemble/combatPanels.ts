import { defaultLayout, type Placement } from './model'

type TextBlock = { text: string; height: number; placement: Placement }
// All dimensions are output pixels. Text heights come from the same wrapped
// runs used by the painter, including font size, line spacing, and icon widths.
export function combatPanels(width: number, height: number, bottomHeight: number, upper: TextBlock, lower: TextBlock) {
  const padding = width * .04
  const hasUpper = !!upper.text.trim(), hasLower = !!lower.text.trim()
  const upperHeight = hasUpper ? upper.height : 0, lowerHeight = hasLower ? lower.height : 0
  const lowerDepth = hasLower ? lowerHeight + padding * 2 : 0
  const upperDepth = hasUpper ? upperHeight + padding * 2 : 0
  const autoTop = height - bottomHeight - lowerDepth - upperDepth
  const defaults = defaultLayout()
  const isAuto = (p: Placement, key: 'upper_text' | 'lower_text') => p.autoY ?? p.y === defaults[key].y
  const upperY = isAuto(upper.placement, 'upper_text') ? autoTop + padding : upper.placement.y * height / 100
  const lowerY = isAuto(lower.placement, 'lower_text')
    ? Math.max(autoTop + upperDepth + padding, hasUpper ? upperY + upperHeight + padding * 2 : -Infinity)
    : lower.placement.y * height / 100
  const foregroundY = hasLower ? lowerY - padding : null
  const backgroundY = hasUpper || hasLower ? Math.min(autoTop, hasUpper ? upperY - padding : Infinity, hasLower ? lowerY - padding : Infinity) : null
  const end = Math.max(hasUpper ? upperY + upperHeight : 0, hasLower ? lowerY + lowerHeight : 0)
  return {
    backgroundY, foregroundY, bottomY: height - bottomHeight,
    upperY, lowerY,
    overflow: end > height - bottomHeight || (backgroundY !== null && backgroundY < 0),
    overlap: hasUpper && hasLower && foregroundY !== null && upperY + upperHeight > foregroundY,
  }
}
