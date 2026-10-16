import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BombIcon } from '../../components/icons'
import { deleteAllCards } from '../cards/api'

// Tools for debugging; they destroy data.
export function DebugSection() {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const reset = useMutation({
    mutationFn: deleteAllCards,
    onSuccess: async () => { setConfirming(false); await queryClient.invalidateQueries({ queryKey: ['cards'] }) },
  })
  return (
    <section className="flex flex-col gap-3 rounded-md border border-danger/40 bg-surface p-4">
      <h2 className="text-[13px] font-medium text-danger">Debug</h2>
      <p className="m-0 text-xs text-ink/60">Removes every card and its artwork. Factions, card types, templates and generated images are kept.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { reset.reset(); setConfirming(true) }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-danger/50 bg-transparent px-3.5 py-2 text-sm font-medium text-danger hover:bg-danger/10">
          <BombIcon /> Reset all cards
        </button>
        {reset.isSuccess && !confirming && <span role="status" className="text-sm text-success">Removed {reset.data.deleted} card{reset.data.deleted === 1 ? '' : 's'}.</span>}
      </div>
      {confirming && <ConfirmDialog title="Reset all cards?" body="This permanently deletes every card, with its artwork. It cannot be undone."
        confirmLabel={reset.isPending ? 'Deleting…' : 'Delete all cards'} error={reset.isError ? reset.error.message : null}
        onConfirm={() => { if (!reset.isPending) reset.mutate() }} onCancel={() => { if (!reset.isPending) setConfirming(false) }} />}
    </section>
  )
}
