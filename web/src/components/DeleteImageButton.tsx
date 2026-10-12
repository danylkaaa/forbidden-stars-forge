import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteImage, refreshImages } from '../lib/deleteImages'
import type { ImageRef } from '../lib/favorites'
import { ConfirmDialog } from './ConfirmDialog'

export function DeleteImageButton({ target, name, disabled = false, overlay = false }: { target: ImageRef; name: string; disabled?: boolean; overlay?: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteImage(target),
    onSuccess: async () => {
      setConfirming(false)
      await refreshImages(queryClient)
    },
  })
  return <>
    <button type="button" aria-label={`Delete ${name}`} title="Delete generated image" disabled={disabled || remove.isPending}
      className={`${overlay ? 'absolute right-2 top-2 z-[1] h-8 w-8 bg-black/70! backdrop-blur-sm ' : ''}inline-flex cursor-pointer items-center justify-center gap-1 rounded border border-danger/35 bg-transparent px-2 py-1 text-xs text-danger hover:border-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={() => { remove.reset(); setConfirming(true) }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
      {!overlay && 'Delete'}
    </button>
    {confirming && <ConfirmDialog title="Delete generated image?" body={`Permanently delete “${name}” from Library and Generations? This cannot be undone. Images used by a template must be unselected first.`}
      confirmLabel={remove.isPending ? 'Deleting…' : 'Delete image'} error={remove.error?.message}
      onConfirm={() => { if (!remove.isPending) remove.mutate() }} onCancel={() => { if (!remove.isPending) setConfirming(false) }} />}
  </>
}
