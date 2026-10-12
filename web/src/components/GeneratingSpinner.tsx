import type { CSSProperties, ReactNode } from 'react'

// A loading animation for an image being generated. The variant is picked
// from `seed` (e.g. the generation id): random-looking across images, but
// stable for one image so it doesn't change on every re-render.
const accent = 'var(--color-accent)'

const VARIANTS: ((px: number) => ReactNode)[] = [
  // ring: rotating arc
  (px) => (
    <span className="block rounded-full" style={{
      width: px, height: px, border: `${Math.max(2, px / 12)}px solid var(--color-accent-800)`,
      borderTopColor: accent, animation: 'spinner-spin 0.9s linear infinite',
    }} />
  ),
  // orbit: three dots circling
  (px) => (
    <span className="relative block" style={{ width: px, height: px, animation: 'spinner-spin 1.4s linear infinite' }}>
      {[0, 120, 240].map((deg, i) => (
        <span key={deg} className="absolute rounded-full" style={{
          width: px / 4.5, height: px / 4.5, left: '50%', top: '50%', background: accent, opacity: 1 - i * 0.3,
          transform: `rotate(${deg}deg) translate(${px / 2.6}px) translate(-50%, -50%)`,
        }} />
      ))}
    </span>
  ),
  // bars: equalizer wave
  (px) => (
    <span className="flex items-center" style={{ width: px, height: px, gap: px / 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="block flex-1 rounded-full" style={{
          height: '100%', background: accent, animation: `spinner-bar 1s ease-in-out ${i * 0.12}s infinite`,
        }} />
      ))}
    </span>
  ),
  // grid: 3×3 cells lighting up diagonally
  (px) => (
    <span className="grid grid-cols-3" style={{ width: px, height: px, gap: px / 14 }}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="block rounded-[2px]" style={{
          background: accent, animation: `spinner-cell 1.3s ease-in-out ${((i % 3) + Math.floor(i / 3)) * 0.1}s infinite`,
        }} />
      ))}
    </span>
  ),
  // cog: a turning gear (fits the grimdark machinery)
  (px) => (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" style={{ animation: 'spinner-spin 2.4s linear infinite' }}>
      <path fill={accent} d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.7c.1.6.1 1.3 0 1.9l2 1.7-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.7a6 6 0 0 1 0-1.9l-2-1.7 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" transform="translate(0 1.5)" />
    </svg>
  ),
  // flip: a card flipping over
  (px) => (
    <span className="block rounded-[3px]" style={{
      width: px * 0.62, height: px * 0.85, background: accent, animation: 'spinner-flip 1.6s ease-in-out infinite',
    }} />
  ),
  // ripple: expanding rings
  (px) => (
    <span className="relative block" style={{ width: px, height: px }}>
      {[0, 0.6].map((delay) => (
        <span key={delay} className="absolute inset-0 rounded-full" style={{
          border: `${Math.max(2, px / 14)}px solid ${accent}`, animation: `spinner-ripple 1.2s cubic-bezier(0, 0.2, 0.8, 1) ${delay}s infinite`,
        } as CSSProperties} />
      ))}
    </span>
  ),
]

export function GeneratingSpinner({ seed, size = 'lg' }: { seed: number; size?: 'sm' | 'lg' }) {
  const px = size === 'lg' ? 56 : 22
  const variant = VARIANTS[Math.abs(Math.trunc(seed)) % VARIANTS.length]
  return (
    <span role="status" aria-label="Generating" className="spinner-anim inline-grid place-items-center">
      {variant(px)}
    </span>
  )
}
