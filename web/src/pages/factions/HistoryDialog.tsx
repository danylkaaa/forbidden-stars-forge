import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DiffPanel } from '../../components/DiffPanel'
import { Tag } from '../../components/Tag'
import { restoreRevision, useRevisions, type Faction, type FactionRevision } from './api'
import { useFactionsUi } from './store'

const sourceVariant = { claude: 'solid-accent', manual: 'neutral', rollback: 'outline-accent' } as const

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function RevisionRow({ rev, faction, isCurrent }: { rev: FactionRevision; faction: Faction; isCurrent: boolean }) {
  const ui = useFactionsUi()
  const queryClient = useQueryClient()
  const expanded = ui.expandedRevId === rev.id
  const [restoreError, setRestoreError] = useState<string | null>(null)

  async function onRestore() {
    try {
      await restoreRevision(faction.id, rev.id)
      queryClient.invalidateQueries({ queryKey: ['factions'] })
      setRestoreError(null)
      ui.set({ expandedRevId: null })
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'failed to restore revision')
    }
  }

  const simpleRows = []
  if (rev.name !== faction.name) simpleRows.push({ field: 'name', before: rev.name, after: faction.name })
  if (rev.dlc !== faction.dlc) simpleRows.push({ field: 'dlc', before: rev.dlc, after: faction.dlc })
  if (rev.primary_color !== faction.primary_color) simpleRows.push({ field: 'primary color', before: rev.primary_color, after: faction.primary_color })
  if (rev.texture !== faction.texture) simpleRows.push({ field: 'texture', before: rev.texture, after: faction.texture })

  return (
    <div className="overflow-hidden rounded-md border border-ink/10">
      <button type="button" onClick={() => ui.set({ expandedRevId: expanded ? null : rev.id })}
        className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3.5 py-3 text-left text-ink">
        <Tag variant={sourceVariant[rev.source]}>{rev.source}</Tag>
        <span className="whitespace-nowrap text-xs text-ink/50">{rev.created_at}</span>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink/65">
          {truncate(rev.description, 60)}
        </span>
        {isCurrent && <span className="whitespace-nowrap text-[11px] text-ink/40">current</span>}
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 px-3.5 pb-3.5">
          <DiffPanel simpleRows={simpleRows}
            textDiffs={[{ field: 'description (this revision → current)', before: rev.description, after: faction.description }]} />
          <Button className="self-start" disabled={isCurrent} onClick={onRestore}>Restore this version</Button>
          {restoreError && <p role="alert" className="m-0 text-sm text-danger">{restoreError}</p>}
        </div>
      )}
    </div>
  )
}

export function HistoryDialog({ factions }: { factions: Faction[] }) {
  const ui = useFactionsUi()
  const faction = factions.find((f) => f.id === ui.historyFactionId) ?? null
  const { data: revisions, error } = useRevisions(faction ? faction.id : null)

  if (!faction) return null

  return (
    <Dialog title={`${faction.name} — History`} width="min(640px,100%)"
      onBackdropClick={() => ui.set({ historyFactionId: null, expandedRevId: null })}
      titleExtra={<Button onClick={() => ui.set({ historyFactionId: null, expandedRevId: null })}>Close</Button>}>
      {error ? (
        <p role="alert" className="text-danger">
          Failed to load history: {error instanceof Error ? error.message : 'unknown error'}
        </p>
      ) : !revisions ? (
        <p className="text-ink/60">Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {revisions.map((rev, i) => (
            <RevisionRow key={rev.id} rev={rev} faction={faction} isCurrent={i === 0} />
          ))}
          {revisions.length === 0 && <p className="m-0 text-sm text-ink/50">No revisions yet.</p>}
        </div>
      )}
    </Dialog>
  )
}
