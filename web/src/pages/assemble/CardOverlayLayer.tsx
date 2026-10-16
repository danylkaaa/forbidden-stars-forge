import { useMemo } from 'react'
import type { Category } from '../cards/model'
import { useAssembledPreview, usePreviewCard } from './previewCard'

// The finished card (frame, text, icons, artwork) drawn over a generated image as a reference while it is painted
// on: the faction's first card of that kind, or the demo card. It ignores the pointer, so painting goes through it.
// `blank` draws the card on an empty template of that size instead of the image: only the frame, text, icons and artwork.
export function CardOverlayLayer({ imageUrl, factionId, category, opacity, blank }: { imageUrl: string; factionId: number; category: Category; opacity: number; blank?: { w: number; h: number } }) {
  const { card } = usePreviewCard(factionId, 0, undefined, category)
  const empty = useMemo(() => {
    if (!blank) return null
    const c = document.createElement('canvas'); c.width = blank.w; c.height = blank.h
    return c.toDataURL('image/png')
  }, [blank?.w, blank?.h]) // eslint-disable-line react-hooks/exhaustive-deps
  const { result } = useAssembledPreview(blank ? empty : imageUrl, factionId, card)
  const url = useMemo(() => result?.canvas.toDataURL('image/png'), [result])
  if (!url) return null
  return <img src={url} alt="" aria-hidden="true" data-testid="card-overlay" draggable={false} style={{ opacity }}
    className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />
}
