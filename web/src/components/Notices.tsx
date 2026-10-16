import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { formatCost, formatDuration } from '../lib/format'
import { NOTICE_MS, noticeLink, useNotices, type Notice } from '../lib/notifications'
import { useGenerations } from '../pages/test-generation/api'

// Watches the generations app-wide and announces each one that finishes (or fails) while the app is open.
export function GenerationWatcher() {
  const { data } = useGenerations()
  const notify = useNotices((s) => s.notify)
  // The status each generation had when last seen; the first look only records, it announces nothing.
  const seen = useRef<Map<number, string> | null>(null)
  useEffect(() => {
    if (!data) return
    const before = seen.current
    seen.current = new Map(data.map((g) => [g.id, g.status]))
    if (!before) return
    for (const g of data) {
      if (before.get(g.id) === 'pending' && g.status !== 'pending') {
        notify({ generationId: g.id, factionId: g.faction_id, cardTypeId: g.card_type_id, name: g.name || `Generation #${g.id}`, durationMs: g.duration_ms, costUsd: g.cost_usd, failed: g.status === 'failed', error: g.error })
      }
    }
  }, [data, notify])
  return null
}

function NoticeCard({ notice }: { notice: Notice }) {
  const navigate = useNavigate()
  const dismiss = useNotices((s) => s.dismiss)
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(notice.id), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice.id, dismiss])
  return (
    <div role="status" className={`pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-md border bg-surface p-3 shadow-[0_6px_18px_rgba(0,0,0,0.55)] ${notice.failed ? 'border-danger/60' : 'border-accent/50'}`}>
      <button type="button" onClick={() => { dismiss(notice.id); navigate(noticeLink(notice)) }} title="Open in AI Lab"
        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-ink">
        <span className={`block text-[11px] font-semibold uppercase tracking-wider ${notice.failed ? 'text-danger' : 'text-accent'}`}>{notice.failed ? 'Generation failed' : 'Generation finished'}</span>
        <span className="block truncate text-sm font-medium" title={notice.name}>{notice.name}</span>
        <span className="block text-xs text-ink/60">
          {notice.failed ? <span className="line-clamp-2">{notice.error || 'No details'}</span> : `${formatDuration(notice.durationMs)} · ${formatCost(notice.costUsd)}`}
        </span>
      </button>
      <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(notice.id)}
        className="grid size-6 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-lg leading-none text-ink/60 hover:bg-neutral-800 hover:text-ink">×</button>
    </div>
  )
}

// The stack of notices in the top right corner, newest on top.
export function Notices() {
  const notices = useNotices((s) => s.notices)
  if (!notices.length) return null
  return <div aria-label="Notifications" className="pointer-events-none fixed top-3 right-3 z-[100] flex flex-col gap-2">
    {notices.map((n) => <NoticeCard key={n.id} notice={n} />)}
  </div>
}
