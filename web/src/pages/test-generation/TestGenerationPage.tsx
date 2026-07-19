import { useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { formatCost, useGenerations } from './api'
import { GenerationSetup } from './GenerationSetup'
import { HistoryRow } from './HistoryRow'

export default function TestGenerationPage() {
  const { data: gens, isLoading, error } = useGenerations()
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()

  const total = (gens ?? []).filter((g) => g.status === 'done').reduce((sum, g) => sum + g.cost_usd, 0)
  const factionName = (id: number) => factions?.find((f) => f.id === id)?.name ?? '—'
  const cardTypeName = (id: number) => cardTypes?.find((c) => c.id === id)?.name ?? '—'

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Test Generation</h1>
        <p className="m-0 text-sm text-ink/60">Generate one card interactively before committing to a batch</p>
      </div>

      <GenerationSetup />

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="m-0 text-xl font-medium">History</h2>
          <span className="text-sm text-ink/60">Total: {formatCost(total)}</span>
        </div>
        {isLoading && <p className="text-ink/60">Loading…</p>}
        {error && <p role="alert" className="text-danger">Failed to load history: {error instanceof Error ? error.message : 'unknown'}</p>}
        <div className="flex flex-col gap-2">
          {gens?.map((g) => (
            <HistoryRow key={g.id} gen={g} factionName={factionName(g.faction_id)} cardTypeName={cardTypeName(g.card_type_id)} />
          ))}
          {gens && gens.length === 0 && <p className="m-0 text-sm text-ink/50">No generations yet.</p>}
        </div>
      </div>
    </div>
  )
}
