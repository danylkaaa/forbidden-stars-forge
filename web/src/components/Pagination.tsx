// Page numbers with prev/next and ellipses: 1 … 4 5 [6] 7 8 … 20.
function pageList(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2])
  const out: (number | '…')[] = []
  for (let p = 1; p <= pages; p++) {
    if (!keep.has(p)) continue
    const prev = out[out.length - 1]
    if (typeof prev === 'number' && p - prev > 1) out.push('…')
    out.push(p)
  }
  return out
}

const cell = 'inline-grid min-w-8 place-items-center rounded-md border px-2 py-1 font-mono text-[12px]'

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"
        className={`${cell} cursor-pointer border-divider bg-transparent text-ink hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40`}>‹</button>
      {pageList(page, pages).map((p, i) => p === '…' ? (
        <span key={`gap-${i}`} className="px-1 text-ink/40">…</span>
      ) : (
        <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}
          aria-label={`Page ${p}`}
          className={`${cell} cursor-pointer ${p === page ? 'border-mars bg-mars-700/60 text-accent-100' : 'border-divider bg-transparent text-ink/75 hover:border-accent/60'}`}>
          {p}
        </button>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"
        className={`${cell} cursor-pointer border-divider bg-transparent text-ink hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40`}>›</button>
    </nav>
  )
}
