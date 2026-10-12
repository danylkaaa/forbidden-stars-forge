import { useState } from 'react'
import { useSetFavorite, type ImageRef } from '../lib/favorites'

// Star toggle for an image. Flips immediately; reverts if the save fails.
// variant="pill" matches the image popup's toolbar buttons.
export function FavoriteButton({ target, favorite, variant = 'icon' }: { target: ImageRef; favorite: boolean; variant?: 'icon' | 'pill' }) {
  const setFavorite = useSetFavorite()
  const [pending, setPending] = useState<boolean | null>(null)
  const shown = pending ?? favorite

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !shown
    setPending(next)
    try {
      await setFavorite(target, next)
    } catch {
      // fall back to the server value
    } finally {
      setPending(null)
    }
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={shown}
      aria-label={shown ? 'Remove from favorites' : 'Add to favorites'}
      title={shown ? 'Remove from favorites' : 'Add to favorites'}
      className={variant === 'pill'
        ? `inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${shown ? 'border-warn/60 bg-warn/15 text-warn' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`
        : `inline-grid size-7 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-base leading-none hover:bg-ink/5 ${shown ? 'text-warn' : 'text-ink/35 hover:text-ink/70'}`}>
      {variant === 'pill' ? <>{shown ? '★' : '☆'} {shown ? 'Favorite' : 'Add to favorites'}</> : shown ? '★' : '☆'}
    </button>
  )
}
