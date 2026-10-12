import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ImageRef } from './favorites'
import { deleteImage, refreshImages } from './deleteImages'

export type ImageChoice = { key: string; name: string; ref: ImageRef }

export function useImageSelection(images: ImageChoice[], scope: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<ImageChoice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const client = useQueryClient()
  useEffect(() => { setSelected(new Set()); setConfirming(null); setError(null) }, [scope])
  const chosen = images.filter(image => selected.has(image.key))
  const remove = useMutation({
    mutationFn: async (targets: ImageChoice[]) => {
      const failed: ImageChoice[] = [], errors: string[] = []
      for (const image of targets) {
        try { await deleteImage(image.ref) }
        catch (e) { failed.push(image); errors.push(`${image.name}: ${e instanceof Error ? e.message : 'Delete failed'}`) }
      }
      setSelected(new Set(failed.map(image => image.key)))
      setConfirming(failed.length ? failed : null)
      setError(errors.length ? errors.join('; ') : null)
      await refreshImages(client)
    },
  })
  const toggle = (key: string) => setSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  return { selected, chosen, toggle, setSelected, confirming, setConfirming, error, setError, remove }
}

export type Selection = ReturnType<typeof useImageSelection>

