import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { deleteFaction, useFactions } from './api'
import { FactionDialog } from './FactionDialog'
import { FactionsTable } from './FactionsTable'
import { GenerateButton } from './GenerateButton'
import { HistoryDialog } from './HistoryDialog'
import { useFactionsUi } from './store'

export default function FactionsPage() {
  const { data, isLoading, error } = useFactions()
  const ui = useFactionsUi()
  const queryClient = useQueryClient()

  const confirmTarget = data?.find((f) => f.id === ui.deleteConfirmId)

  async function confirmDelete() {
    if (!confirmTarget) return
    await deleteFaction(confirmTarget.id)
    ui.set({ deleteConfirmId: null })
    queryClient.invalidateQueries({ queryKey: ['factions'] })
  }

  return (
    <div className="max-w-5xl">
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
          onDelete={(f) => ui.set({ deleteConfirmId: f.id })} />
      )}

      <FactionDialog generateSlot={<GenerateButton />} />

      <HistoryDialog factions={data ?? []} />

      {confirmTarget && (
        <ConfirmDialog title="Delete faction?"
          body={`Removing ${confirmTarget.name} can't be undone.`}
          confirmLabel="Delete faction"
          onConfirm={confirmDelete}
          onCancel={() => ui.set({ deleteConfirmId: null })} />
      )}
    </div>
  )
}
