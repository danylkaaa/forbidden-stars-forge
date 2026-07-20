import { useState } from 'react'
import { useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Tag } from '../../components/Tag'
import { formatCost, formatDuration } from '../../lib/format'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import { useBatch, cancelBatch, batchDownloadUrl } from './api'
import { ItemCard } from './ItemCard'

function elapsedMs(startISO: string, endISO: string): number {
  const start = new Date(startISO).getTime()
  const end = new Date(endISO).getTime()
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const batchId = id ? Number(id) : null
  const { data, isLoading, error, refetch } = useBatch(batchId)
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()
  const queryClient = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function doCancel() {
    if (batchId === null) return
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelBatch(batchId)
      setConfirmCancel(false)
      queryClient.invalidateQueries({ queryKey: ['batches', batchId] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'failed to cancel batch')
    } finally {
      setCancelling(false)
    }
  }

  if (error) {
    return (
      <div className="max-w-5xl">
        <p role="alert" className="m-0 text-sm text-danger">
          Failed to load batch: {error instanceof Error ? error.message : 'unknown'}
        </p>
      </div>
    )
  }
  if (isLoading || !data) {
    return <div className="max-w-5xl"><p className="text-ink/60">Loading…</p></div>
  }

  const { batch, items } = data
  const active = batch.status === 'created' || batch.status === 'submitted' || batch.status === 'in_progress'
  const cancellable = batch.status === 'submitted' || batch.status === 'in_progress'
  const factionName = (fid: number) => factions?.find((f) => f.id === fid)?.name ?? '—'
  const cardTypeName = (ctid: number) => cardTypes?.find((c) => c.id === ctid)?.name ?? '—'

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <h1 className="m-0 text-[32px] font-medium leading-tight tracking-tight">Batch #{batch.id}</h1>
            <Tag variant={batch.mode === 'final' ? 'solid-accent' : 'neutral'}>{batch.mode}</Tag>
            <Tag variant={active ? 'outline-accent' : batch.status === 'completed' ? 'solid-accent' : 'warn'}>
              {batch.status.replace('_', ' ')}
            </Tag>
          </div>
          <p className="m-0 text-sm text-ink/60">
            {batch.counts.completed + batch.counts.failed}/{batch.counts.total} done
            {batch.submitted_at && batch.completed_at && ` · ${formatDuration(elapsedMs(batch.submitted_at, batch.completed_at))}`}
            {batch.total_cost_usd > 0
              ? ` · ${formatCost(batch.total_cost_usd)} actual (est. ${formatCost(batch.est_cost_usd)})`
              : ` · est. ${formatCost(batch.est_cost_usd)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {active && <Button onClick={() => refetch()}>Refresh</Button>}
          {cancellable && <Button onClick={() => setConfirmCancel(true)}>Cancel</Button>}
          {batch.status === 'completed' && (
            <a href={batchDownloadUrl(batch.id)}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent bg-transparent px-3.5 py-2 text-sm font-medium text-accent no-underline hover:bg-accent/10">
              Download ZIP
            </a>
          )}
        </div>
      </div>

      {batch.status === 'failed' && (
        <p role="alert" className="m-0 mb-3.5 text-sm text-danger">This batch failed — check individual items below for details.</p>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} batchId={batch.id}
            factionName={factionName(item.faction_id)} cardTypeName={cardTypeName(item.card_type_id)} />
        ))}
      </div>
      {items.length === 0 && <p className="m-0 text-sm text-ink/50">No items in this batch.</p>}

      {confirmCancel && (
        <ConfirmDialog title="Cancel batch?"
          body="OpenAI will stop processing any requests that haven't completed yet."
          confirmLabel="Cancel batch" cancelLabel="Keep running"
          error={cancelError}
          onConfirm={doCancel}
          onCancel={() => { if (!cancelling) { setConfirmCancel(false); setCancelError(null) } }} />
      )}
    </div>
  )
}
