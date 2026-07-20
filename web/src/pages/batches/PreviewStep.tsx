import { Button } from '../../components/Button'
import { formatCost } from '../../lib/format'
import type { BatchMode, BatchPreview } from './api'

export function PreviewStep({
  preview, mode, submitting, onBack, onSubmit,
}: { preview: BatchPreview; mode: BatchMode; submitting: boolean; onBack: () => void; onSubmit: () => void }) {
  return (
    <div className="flex flex-col gap-3.5">
      {mode === 'final' ? (
        <p className="m-0 rounded-md border border-warn/40 bg-warn/15 px-3 py-2 text-[13px] font-medium text-warn">
          FINAL BATCH — high quality, real cost
        </p>
      ) : (
        <p className="m-0 rounded-md border border-divider bg-surface px-3 py-2 text-[13px] text-ink/70">
          DRAFT batch — low quality, cheap iteration
        </p>
      )}

      <div className="flex items-center gap-4 text-sm text-ink/70">
        <span>{preview.count} request{preview.count === 1 ? '' : 's'}</span>
        <span>est. {formatCost(preview.est_cost)} total (estimate)</span>
      </div>

      <div>
        <span className="mb-1 block text-xs text-ink/70">Request file (requests.jsonl)</span>
        <pre className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-divider bg-bg p-2.5 font-mono text-[11.5px] leading-normal text-ink/75">
          {preview.jsonl}
        </pre>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onBack} disabled={submitting}>Back</Button>
        <Button variant="primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit batch to OpenAI'}
        </Button>
      </div>
    </div>
  )
}
