import { useEffect, useState } from 'react'
import { cancelJob, startGenerateDescription, useJob } from './api'
import type { DLC } from './dlc'
import { useFactionDraft, useFactionsUi } from './store'

export function GenerateButton({ intervalMs = 2000 }: { intervalMs?: number }) {
  const name = useFactionDraft((s) => s.draft?.name ?? '')
  const dlc = useFactionDraft((s) => s.draft?.dlc ?? '')
  const activeJobId = useFactionsUi((s) => s.activeJobId)
  const [jobError, setJobError] = useState<string | null>(null)

  const [starting, setStarting] = useState(false)

  const job = useJob(activeJobId, intervalMs)
  const pending = activeJobId !== null && (job.data === undefined || job.data.status === 'pending')

  useEffect(() => {
    const j = job.data
    if (!j || j.status === 'pending') return
    const ui = useFactionsUi.getState()
    if (ui.activeJobId !== j.id) return
    if (j.status === 'done' && j.result !== undefined) {
      useFactionDraft.getState().setField('description', j.result)
      ui.set({ lastGenerated: j.result, showDiff: true, activeJobId: null })
    } else if (j.status === 'failed') {
      ui.set({ activeJobId: null })
      setJobError(j.error ?? 'generation failed')
    }
  }, [job.data])

  useEffect(() => {
    if (!activeJobId || !job.isError) return
    const ui = useFactionsUi.getState()
    if (ui.activeJobId !== activeJobId) return
    ui.set({ activeJobId: null })
    const msg = job.error instanceof Error ? job.error.message : 'unknown error'
    setJobError(`failed to check generation status: ${msg}`)
  }, [job.isError, job.error, activeJobId])

  async function onGenerate() {
    if (starting) return
    setStarting(true)
    setJobError(null)
    try {
      const res = await startGenerateDescription(name.trim(), dlc as DLC)
      useFactionsUi.getState().set({ activeJobId: res.job_id })
    } catch (e) {
      setJobError(e instanceof Error ? e.message : 'failed to start generation')
    } finally {
      setStarting(false)
    }
  }

  async function onCancel() {
    if (activeJobId) await cancelJob(activeJobId).catch(() => {})
  }

  return (
    <span className="inline-flex items-center gap-2">
      {jobError && <span role="alert" className="text-[11px] text-danger">{jobError}</span>}
      {pending && (
        <button type="button" onClick={onCancel} aria-label="Cancel generation"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-ink/60 hover:text-ink">
          Cancel generation
        </button>
      )}
      <button type="button" onClick={onGenerate} disabled={!name.trim() || pending || starting}
        className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-45">
        {pending || starting ? 'Generating…' : 'Generate with Claude'}
      </button>
    </span>
  )
}
