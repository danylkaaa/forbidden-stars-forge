import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { deleteCardType, useCardTypes } from './api'
import { CardTypesTable } from './CardTypesTable'
import { CardTypeDialog } from './CardTypeDialog'
import { useCardTypesUi } from './store'

export default function CardTypesPage() {
  const { data, isLoading, error } = useCardTypes()
  const ui = useCardTypesUi()
  const queryClient = useQueryClient()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const confirmTarget = data?.find((c) => c.id === ui.deleteConfirmId)

  async function confirmDelete() {
    if (!confirmTarget) return
    try {
      await deleteCardType(confirmTarget.id)
      ui.set({ deleteConfirmId: null })
      queryClient.invalidateQueries({ queryKey: ['card-types'] })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'failed to delete card type')
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Card Templates</h1>
          <p className="m-0 text-sm text-ink/60">{data?.length ?? 0} card types · each holds one chromakey template</p>
        </div>
        <Button variant="primary" onClick={ui.openCreate}>New Card Type</Button>
      </div>

      {isLoading && <p className="text-ink/60">Loading…</p>}
      {error && <p role="alert" className="text-danger">Failed to load card types: {error instanceof Error ? error.message : 'unknown'}</p>}
      {data && (
        <CardTypesTable cardTypes={data}
          onEdit={(ct) => ui.openEdit(ct)}
          onDelete={(ct) => { setDeleteError(null); ui.set({ deleteConfirmId: ct.id }) }} />
      )}

      <CardTypeDialog cardTypes={data ?? []} />

      {confirmTarget && (
        <ConfirmDialog title="Delete card type?"
          body={`Removing ${confirmTarget.name} can't be undone.`}
          confirmLabel="Delete card type"
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => { ui.set({ deleteConfirmId: null }); setDeleteError(null) }} />
      )}
    </div>
  )
}
