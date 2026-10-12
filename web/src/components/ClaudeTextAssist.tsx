import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { DiffPanel } from './DiffPanel'
import { inputClass } from './Field'
import { cancelJob, useJob, type ChatMessage } from '../lib/jobs'

// Conversation with Claude about one text field: the user sends
// instructions / pasted reference text, Claude proposes an edited version,
// and the user accepts it, cancels, or asks for adjustments (which replays
// the whole conversation — the claude CLI is stateless).
//
// The parent mounts this while the panel is open; unmounting cancels any
// running job.
export function ClaudeTextAssist({
  field, current, start, onAccept, onClose, intervalMs = 2000,
}: {
  field: string // human label, e.g. "description"
  current: string // the field's live value; pinned as the baseline on the first send
  start: (baseline: string, messages: ChatMessage[]) => Promise<{ job_id: string }>
  onAccept: (text: string) => void
  onClose: () => void
  intervalMs?: number
}) {
  const [baseline, setBaseline] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [proposal, setProposal] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)

  const job = useJob(jobId, intervalMs)
  const pending = jobId !== null && (job.data === undefined || job.data.status === 'pending')

  const jobRef = useRef<string | null>(null)
  jobRef.current = jobId
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  useEffect(() => () => {
    if (jobRef.current) cancelJob(jobRef.current).catch(() => {})
  }, [])

  // A failed turn drops the unanswered user message and puts its text back
  // in the input so the user can retry or reword it.
  function rollBack(msg: string) {
    setJobId(null)
    const ms = messagesRef.current
    const last = ms.at(-1)
    if (last?.role === 'user') {
      setInput(last.content)
      setMessages(ms.slice(0, -1))
    }
    setError(msg)
  }

  useEffect(() => {
    const j = job.data
    if (!j || j.status === 'pending' || j.id !== jobId) return
    if (j.status === 'done' && j.result !== undefined) {
      const result = j.result
      setMessages((ms) => [...ms, { role: 'assistant', content: result }])
      setProposal(result)
      setJobId(null)
    } else if (j.status === 'failed') {
      rollBack(j.error ?? 'generation failed')
    }
  }, [job.data, jobId])

  useEffect(() => {
    if (!jobId || !job.isError) return
    rollBack(`failed to check generation status: ${job.error instanceof Error ? job.error.message : 'unknown error'}`)
  }, [job.isError, job.error, jobId])

  async function send() {
    if (startingRef.current) return
    startingRef.current = true
    // The first turn pins the text Claude edits; later turns keep it.
    const base = messages.length === 0 ? current : baseline
    const next: ChatMessage[] = [...messages, { role: 'user', content: input.trim() }]
    setStarting(true)
    setError(null)
    setBaseline(base)
    setMessages(next)
    messagesRef.current = next
    setProposal(null)
    try {
      const res = await start(base, next)
      setInput('')
      setJobId(res.job_id)
    } catch (e) {
      rollBack(e instanceof Error ? e.message : 'failed to start generation')
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  function close() {
    if (jobId) cancelJob(jobId).catch(() => {})
    setJobId(null)
    onClose()
  }

  // Claude has answered at least once and the user chose Adjust.
  const adjusting = proposal === null && messages.length > 0
  const reviewing = proposal !== null && !pending
  const editing = (messages.length === 0 ? current : baseline).trim() !== ''
  const userTurns = messages.filter((m) => m.role === 'user')
  const inputId = `claude-assist-${field.replace(/\W+/g, '-')}`

  return (
    <section aria-label={`Claude assistant: ${field}`} className="flex flex-col gap-2.5 rounded-md border border-accent/40 bg-bg p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-accent">Claude · {field}</span>
        <button type="button" onClick={close}
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-ink/60 hover:text-ink">
          {pending ? 'Cancel generation' : 'Close'}
        </button>
      </div>

      {userTurns.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-ink/60">
          {userTurns.map((m, i) => (
            <li key={i} className="line-clamp-2"><span className="text-ink/40">You:</span> {m.content || '(improve it)'}</li>
          ))}
        </ol>
      )}

      {pending || starting ? (
        <p className="m-0 animate-pulse text-[13px] text-ink/70">Claude is working on it…</p>
      ) : reviewing ? (
        <>
          <DiffPanel title="Proposed changes" simpleRows={[]}
            textDiffs={[{ field, before: baseline, after: proposal }]} />
          {baseline === proposal && <p className="m-0 text-xs text-ink/50">No changes proposed.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close}>Cancel</Button>
            <Button type="button" onClick={() => setProposal(null)}>Adjust</Button>
            <Button type="button" variant="primary" onClick={() => onAccept(proposal)}>Accept</Button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor={inputId} className="text-xs text-ink/70">
            {adjusting
              ? 'What should Claude change in its proposal?'
              : editing
                ? `Instructions or reference text — Claude edits the current ${field}`
                : `Instructions or reference text — Claude writes a new ${field}`}
          </label>
          <textarea id={inputId} value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={adjusting ? 'e.g. shorter; keep the second sentence' : 'Paste reference text, or describe what to change…'}
            className={`${inputClass} min-h-24 resize-y font-sans`} />
          <div className="flex justify-end gap-2">
            {adjusting && (
              <Button type="button" onClick={() => {
                const last = messages.at(-1)
                if (last?.role === 'assistant') setProposal(last.content)
              }}>Back to proposal</Button>
            )}
            <Button type="button" variant="primary" onClick={send} disabled={adjusting && !input.trim()}>
              Send to Claude
            </Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="m-0 text-[11px] text-danger">{error}</p>}
    </section>
  )
}
