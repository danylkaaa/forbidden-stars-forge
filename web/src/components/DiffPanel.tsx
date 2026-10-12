import { sideBySideDiff, type DiffToken } from '../lib/diff'

const tokenClass: Record<DiffToken['type'], string> = {
  same: 'text-ink/75',
  add: 'bg-success/20 text-success',
  remove: 'bg-danger/20 text-danger line-through',
}

function DiffColumn({ label, tokens }: { label: string; tokens: DiffToken[] }) {
  return (
    <div className="rounded-md bg-surface px-3 py-2 text-[13px] leading-relaxed">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink/40">{label}</div>
      {tokens.map((t, i) => (
        <span key={i} className={tokenClass[t.type]}>
          {t.text}
        </span>
      ))}
    </div>
  )
}

export function DiffPanel({
  title = 'Changes since last save',
  simpleRows,
  textDiffs,
}: {
  title?: string
  simpleRows: { field: string; before: string; after: string }[]
  textDiffs: { field: string; before: string; after: string }[]
}) {
  const changedText = textDiffs
    .map((d) => ({ ...d, diff: sideBySideDiff(d.before, d.after) }))
    .filter((d) => d.diff.changed)

  if (simpleRows.length === 0 && changedText.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-md border border-ink/10 bg-bg p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-ink/50">{title}</div>
      {simpleRows.map((row) => (
        <div key={row.field} className="flex gap-3 text-[13px]">
          <span className="w-20 flex-none text-ink/50">{row.field}</span>
          <span className="text-danger line-through">{row.before}</span>
          <span className="text-ink/30">→</span>
          <span className="text-success">{row.after}</span>
        </div>
      ))}
      {changedText.map((d) => (
        <div key={d.field}>
          <div className="mb-1.5 text-[13px] text-ink/50">{d.field}</div>
          <div className="grid grid-cols-2 gap-3">
            <DiffColumn label="Before" tokens={d.diff.left} />
            <DiffColumn label="After" tokens={d.diff.right} />
          </div>
        </div>
      ))}
    </div>
  )
}
