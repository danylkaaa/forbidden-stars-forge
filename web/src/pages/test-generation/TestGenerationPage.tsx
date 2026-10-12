import { MultiSelect } from '../../components/MultiSelect'
import { previewLayers, useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { DLC_VALUES } from '../factions/dlc'
import { formatCost, useGenerations } from './api'
import { GenerationSetup } from './GenerationSetup'
import { HistoryRow } from './HistoryRow'
import { useTestGenUi } from './store'

export default function TestGenerationPage() {
  const { data: gens, isLoading, error } = useGenerations()
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()

  const filterDlcs = useTestGenUi((s) => s.filterDlcs)
  const filterFactionIds = useTestGenUi((s) => s.filterFactionIds)
  const filterCardTypeIds = useTestGenUi((s) => s.filterCardTypeIds)
  const setUi = useTestGenUi((s) => s.set)

  const factionDlc = new Map((factions ?? []).map((f) => [f.id, f.dlc]))
  // Picking DLCs narrows the faction picker to factions in those DLCs.
  const factionOptions = (factions ?? [])
    .filter((f) => filterDlcs.length === 0 || filterDlcs.includes(f.dlc))
    .map((f) => ({ value: f.id, label: f.name }))
  const filtering = filterDlcs.length + filterFactionIds.length + filterCardTypeIds.length > 0
  const shown = (gens ?? []).filter((g) => {
    const dlc = factionDlc.get(g.faction_id)
    return (filterDlcs.length === 0 || (dlc !== undefined && filterDlcs.includes(dlc))) &&
      (filterFactionIds.length === 0 || filterFactionIds.includes(g.faction_id)) &&
      (filterCardTypeIds.length === 0 || filterCardTypeIds.includes(g.card_type_id))
  })
  const total = shown.filter((g) => g.status === 'done').reduce((sum, g) => sum + g.cost_usd, 0)
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
          <span className="text-sm text-ink/60">{filtering ? 'Filtered total' : 'Total'}: {formatCost(total)}</span>
        </div>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <MultiSelect label="DLC" options={DLC_VALUES.map((d) => ({ value: d, label: d }))} selected={filterDlcs}
            onChange={(dlcs) => {
              // Drop selected factions that the new DLC choice hides.
              const keep = filterFactionIds.filter((id) => dlcs.length === 0 || dlcs.includes(factionDlc.get(id)!))
              setUi({ filterDlcs: dlcs, filterFactionIds: keep })
            }} />
          <MultiSelect label="Faction" options={factionOptions} selected={filterFactionIds}
            onChange={(ids) => setUi({ filterFactionIds: ids })} />
          <MultiSelect label="Card type" options={(cardTypes ?? []).map((c) => ({ value: c.id, label: c.name }))}
            selected={filterCardTypeIds} onChange={(ids) => setUi({ filterCardTypeIds: ids })} />
          {filtering && (
            <button type="button" onClick={() => setUi({ filterDlcs: [], filterFactionIds: [], filterCardTypeIds: [] })}
              className="cursor-pointer border-0 bg-transparent px-1 py-1 text-xs font-medium text-accent">
              Clear filters
            </button>
          )}
          {filtering && gens && <span className="text-xs text-ink/45">{shown.length} of {gens.length}</span>}
        </div>
        {isLoading && <p className="text-ink/60">Loading…</p>}
        {error && <p role="alert" className="text-danger">Failed to load history: {error instanceof Error ? error.message : 'unknown'}</p>}
        <div className="flex flex-col gap-2">
          {shown.map((g) => (
            <HistoryRow key={g.id} gen={g} factionName={factionName(g.faction_id)} cardTypeName={cardTypeName(g.card_type_id)}
              {...previewLayers(cardTypes?.find((c) => c.id === g.card_type_id))} />
          ))}
          {gens && gens.length === 0 && <p className="m-0 text-sm text-ink/50">No generations yet.</p>}
          {gens && gens.length > 0 && shown.length === 0 && <p className="m-0 text-sm text-ink/50">No generations match the filters.</p>}
        </div>
      </div>
    </div>
  )
}
