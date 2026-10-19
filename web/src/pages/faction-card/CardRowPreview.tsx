import { useEffect, useRef, useState } from 'react'
import type { SlotKey } from './model'
import { renderFactionCard, unitPreviewBox, type FactionCardInput } from './render'

// How the unit looks on the faction card: its row cut out of the real front render.
export function CardRowPreview({ input, slot }: { input: FactionCardInput; slot: SlotKey }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => renderFactionCard({ ...input, side: 'front' }).then(({ canvas: card }) => {
      const target = canvas.current
      if (cancelled || !target) return
      const b = unitPreviewBox(slot, input.layout, input.data)
      target.width = Math.round(b.w); target.height = Math.round(b.h)
      target.getContext('2d')?.drawImage(card, b.x, b.y, b.w, b.h, 0, 0, target.width, target.height)
      setError('')
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render the card.') }), 150)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [input, slot])
  return <div className="space-y-1">
    <span className="block text-xs text-ink/70">On the faction card</span>
    <canvas ref={canvas} aria-label="Unit row on the faction card" className="block h-auto w-full rounded border border-divider bg-black/40" />
    {error && <p role="alert" className="m-0 text-xs text-danger">{error}</p>}
  </div>
}
