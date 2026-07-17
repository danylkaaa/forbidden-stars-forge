export const TARGET_RATIO = 816 / 1104

// PRD §7.2: warn when the template's aspect ratio deviates from 816:1104
// by more than 2%.
export function computeAspectWarning(w: number, h: number): string | null {
  if (!w || !h) return null
  const deviation = (Math.abs(w / h - TARGET_RATIO) / TARGET_RATIO) * 100
  if (deviation <= 2) return null
  return `Aspect ratio deviates from 816:1104 by ${deviation.toFixed(1)}% — consider re-cropping`
}
