import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { inputClass } from './Field'

// A free-text input with a button that lists every suggestion. (A native datalist only lists the
// suggestions that match what is already typed, so with a value in the field it opens empty.)
export function SuggestInput({ suggestions, value, onValueChange, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> & {
  suggestions: string[]; value: string; onValueChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])
  return (
    <div ref={box} className="relative" onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }}>
      <input {...props} type="text" value={value} onChange={(e) => onValueChange(e.target.value)} className={`${className ?? inputClass} pr-8`} />
      <button type="button" aria-label="Show suggestions" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="absolute right-0 top-0 grid h-full w-8 cursor-pointer place-items-center border-0 bg-transparent text-[10px] text-ink/50 hover:text-ink">▾</button>
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 m-0 max-h-60 list-none overflow-auto rounded-md border border-divider bg-surface p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {suggestions.map((s) => (
            <li key={s} role="option" aria-selected={s === value}>
              <button type="button" onClick={() => { onValueChange(s); setOpen(false) }}
                className={`w-full cursor-pointer rounded border-0 bg-transparent px-2 py-1.5 text-left text-sm hover:bg-neutral-800 ${s === value ? 'text-accent' : 'text-ink'}`}>{s}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
