import { Link } from 'react-router'
import { useBatches } from './api'
import { BatchRow } from './BatchRow'

export default function BatchesPage() {
  const { data, isLoading, error } = useBatches()

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Batch Processing</h1>
          <p className="m-0 text-sm text-ink/60">{data?.length ?? 0} batches</p>
        </div>
        <Link to="/batches/new"
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent bg-transparent px-3.5 py-2 text-sm font-medium text-accent no-underline hover:bg-accent/10">
          New Batch
        </Link>
      </div>

      {isLoading && <p className="text-ink/60">Loading…</p>}
      {error && <p role="alert" className="text-danger">Failed to load batches: {error instanceof Error ? error.message : 'unknown'}</p>}
      <div className="flex flex-col gap-2">
        {data?.map((b) => <BatchRow key={b.id} batch={b} />)}
        {data && data.length === 0 && <p className="m-0 text-sm text-ink/50">No batches yet.</p>}
      </div>
    </div>
  )
}
