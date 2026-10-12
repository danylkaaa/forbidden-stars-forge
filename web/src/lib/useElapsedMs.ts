import { useEffect, useState } from 'react'

// created_at is SQLite datetime('now'): UTC, "YYYY-MM-DD HH:MM:SS".
const parseCreatedAt = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z')

// Live elapsed time for an in-flight generation (duration_ms is only
// written once it finishes). Ticks every second while active.
export function useElapsedMs(createdAt: string, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return Math.max(0, now - parseCreatedAt(createdAt))
}
