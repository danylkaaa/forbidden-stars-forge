export function formatCost(usd: number): string {
  if (usd < 0.1) {
    const s = usd.toFixed(3)
    return `$${s.endsWith('0') ? s.slice(0, -1) : s}`
  }
  return `$${usd.toFixed(2)}`
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`
}
