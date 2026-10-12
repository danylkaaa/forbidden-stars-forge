import { useEffect, useId, useRef, useState } from 'react'

export type MultiSelectOption<V> = { value: V; label: string }

// Dropdown of checkboxes. An empty selection means "all" (no filter).
export function MultiSelect<V extends string | number>({
  label, options, selected, onChange,
}: {
  label: string
  options: MultiSelectOption<V>[]
  selected: V[]
  onChange: (selected: V[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (v: V) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? '1 selected'
        : `${selected.length} selected`

  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-haspopup="true" aria-expanded={open} aria-controls={listId}
        aria-label={`${label}: ${summary}`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-transparent px-2.5 py-1 text-[13px] ${
          selected.length > 0 ? 'border-accent text-accent' : 'border-divider text-ink'
        }`}>
        <span className="text-ink/50">{label}:</span> {summary}
        <span aria-hidden="true" className="text-[10px] text-ink/40">▾</span>
      </button>
      {open && (
        <div id={listId} role="group" aria-label={label}
          className="absolute left-0 top-full z-10 mt-1 flex max-h-72 min-w-48 flex-col overflow-y-auto rounded-md border border-divider bg-surface p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-ink/5">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
          {options.length === 0 && <span className="px-2 py-1.5 text-[13px] text-ink/50">Nothing to filter</span>}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])}
              className="mt-1 cursor-pointer border-0 border-t border-divider bg-transparent px-2 py-1.5 text-left text-xs font-medium text-accent">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
