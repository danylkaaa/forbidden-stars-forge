import { Link } from 'react-router'
import { Tag } from '../../components/Tag'
import { formatCost } from '../../lib/format'
import type { Batch } from './api'

const statusVariant: Record<Batch['status'], 'neutral' | 'solid-accent' | 'outline-accent' | 'warn'> = {
  created: 'neutral',
  submitted: 'outline-accent',
  in_progress: 'outline-accent',
  completed: 'solid-accent',
  failed: 'warn',
  cancelled: 'neutral',
}

export function BatchRow({ batch }: { batch: Batch }) {
  return (
    <Link to={`/batches/${batch.id}`}
      className="flex items-center gap-3.5 rounded-md bg-surface px-3.5 py-3 text-ink no-underline shadow-[0_0_0_1px_var(--color-neutral-800)] hover:bg-ink/5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Batch #{batch.id}</span>
          <Tag variant={batch.mode === 'final' ? 'solid-accent' : 'neutral'}>{batch.mode}</Tag>
            {batch.model && <span className="font-mono text-[11px] text-ink/45">{batch.model}</span>}
          <Tag variant={statusVariant[batch.status]}>{batch.status.replace('_', ' ')}</Tag>
        </div>
        <div className="mt-0.5 text-xs text-ink/50">
          {batch.counts.completed + batch.counts.failed}/{batch.counts.total} items
          {batch.total_cost_usd > 0 && <> · {formatCost(batch.total_cost_usd)}</>}
        </div>
      </div>
    </Link>
  )
}
