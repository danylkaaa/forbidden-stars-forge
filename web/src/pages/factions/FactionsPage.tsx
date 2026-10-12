import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { deleteFaction, useFactions } from './api'
import { FactionDialog } from './FactionDialog'
import { FactionsTable } from './FactionsTable'
import { ClaudeAssistPanel } from './ClaudeAssistPanel'
import { GenerateButton } from './GenerateButton'
import { HistoryDialog } from './HistoryDialog'
import { useFactionsUi } from './store'

export default function FactionsPage() {
  const { data, isLoading, error } = useFactions()
  const ui = useFactionsUi()
  const queryClient = useQueryClient()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const confirmTarget = data?.find((f) => f.id === ui.deleteConfirmId)

  async function confirmDelete() {
    if (!confirmTarget) return
    try {
      await deleteFaction(confirmTarget.id)
      ui.set({ deleteConfirmId: null })
      queryClient.invalidateQueries({ queryKey: ['factions'] })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'failed to delete faction')
    }
  }

  function cancelDelete() {
    ui.set({ deleteConfirmId: null })
    setDeleteError(null)
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Factions</h1>
          <p className="m-0 text-sm text-ink/60">{data?.length ?? 0} factions · shared across every card type</p>
        </div>
        <Button variant="primary" onClick={ui.openCreate}>New Faction</Button>
      </div>

      {isLoading && <p className="text-ink/60">Loading…</p>}
      {error && <p role="alert" className="text-danger">Failed to load factions: {error instanceof Error ? error.message : 'unknown'}</p>}
      {data && (
        <FactionsTable factions={data}
          onEdit={ui.openEdit}
          onHistory={(f) => ui.set({ historyFactionId: f.id, expandedRevId: null })}
          onDelete={(f) => { setDeleteError(null); ui.set({ deleteConfirmId: f.id }) }} />
      )}

      <FactionDialog generateSlot={<GenerateButton />} assistSlot={<ClaudeAssistPanel />} />

      <HistoryDialog factions={data ?? []} />

      {confirmTarget && (
        <ConfirmDialog title="Delete faction?"
          body={`Removing ${confirmTarget.name} can't be undone.`}
          confirmLabel="Delete faction"
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={cancelDelete} />
      )}
    </div>
  )
}
