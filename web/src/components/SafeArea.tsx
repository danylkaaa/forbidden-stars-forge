import { SAFE_INSET_MM, mmToPx, useSafeArea } from './safeAreaStore'

export function SafeAreaToggle({ className = '' }: { className?: string }) {
  const { show, set } = useSafeArea()
  return <label className={`inline-flex cursor-pointer items-center gap-2 text-xs text-ink/70 ${className}`} title="Red: where the card is cut. Green: keep text and key art inside it.">
    <input type="checkbox" checked={show} onChange={e => set(e.target.checked)} className="accent-[var(--color-accent)]" />Show safe area
  </label>
}

// Lines over a preview of an image of `px` pixels (300 dpi): the cut rectangle
// of `cutMm`, centred in the image (the rest is bleed), and the safe area
// inside it. Place inside a relatively positioned box that fits the preview.
export function SafeAreaLines({ px, cutMm }: { px: { width: number; height: number }; cutMm: { width: number; height: number } }) {
  const show = useSafeArea(s => s.show)
  if (!show || !px.width || !px.height) return null
  const cw = Math.min(px.width, mmToPx(cutMm.width)), ch = Math.min(px.height, mmToPx(cutMm.height))
  const cx = (px.width - cw) / 2, cy = (px.height - ch) / 2, inset = mmToPx(SAFE_INSET_MM)
  const stroke = Math.max(px.width, px.height) / 700
  return <svg viewBox={`0 0 ${px.width} ${px.height}`} preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
    <rect x={cx} y={cy} width={cw} height={ch} fill="none" stroke="#ff2d2d" strokeWidth={stroke} strokeDasharray={`${stroke * 6} ${stroke * 4}`} />
    <rect x={cx + inset} y={cy + inset} width={Math.max(0, cw - 2 * inset)} height={Math.max(0, ch - 2 * inset)} fill="none" stroke="#22e07a" strokeWidth={stroke} strokeDasharray={`${stroke * 3} ${stroke * 3}`} />
  </svg>
}
