import { useEffect, useId, useRef, useState, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { inputClass } from './Field'

type Option = { value: string; label: string; disabled: boolean }

// Keep the native select's form semantics and change handlers, with a themed,
// searchable popup instead of the operating system's option menu.
export function SearchableSelect({ children, onMouseDown, onKeyDown, onChange, 'aria-label': ariaLabel, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const select = useRef<HTMLSelectElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [options, setOptions] = useState<Option[]>([])
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, height: 320 })
  const [label, setLabel] = useState('options')
  const shown = options.filter((o) => o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const close = () => { setOpen(false); select.current?.focus() }
  const show = () => {
    if (props.disabled) return
    setQuery(''); setActive(0); setOpen(true)
  }
  const choose = (option: Option) => {
    if (option.disabled || !select.current) return
    select.current.value = option.value
    select.current.dispatchEvent(new Event('change', { bubbles: true }))
    close()
  }

  useEffect(() => {
    if (!open || !select.current) return
    setOptions(Array.from(select.current.options, (o) => ({ value: o.value, label: o.text, disabled: o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled) })))
    setLabel(ariaLabel || select.current.labels?.[0]?.textContent?.trim() || 'options')
  }, [open, children, ariaLabel])
  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = select.current!.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom - 12
      const height = Math.min(320, Math.max(below, rect.top - 12))
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16)
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: below >= height ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), width, height })
    }
    place(); search.current?.focus()
    const outside = (e: MouseEvent) => {
      if (!popup.current?.contains(e.target as Node) && e.target !== select.current) setOpen(false)
    }
    const focusOutside = (e: FocusEvent) => {
      if (!popup.current?.contains(e.target as Node) && e.target !== select.current) setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('mousedown', outside)
    document.addEventListener('focusin', focusOutside)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('focusin', focusOutside)
    }
  }, [open])
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, listId])

  return <>
    <select {...props} ref={select} aria-label={ariaLabel} aria-expanded={open} aria-controls={open ? listId : undefined}
      onChange={(e) => { setOpen(false); onChange?.(e) }}
      onMouseDown={(e) => { onMouseDown?.(e); if (!e.defaultPrevented && e.button === 0) { e.preventDefault(); if (open) close(); else show() } }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (!e.defaultPrevented && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
        else if (!e.defaultPrevented && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); show(); setQuery(e.key) }
      }}>{children}</select>
    {open && createPortal(<div ref={popup} style={{ position: 'fixed', left: position.left, top: position.top, width: position.width, maxHeight: position.height }}
      className="z-50 flex flex-col gap-1 rounded-md border border-accent/50 bg-surface p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); if (shown.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length)
        } else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]) }
      }}>
      <input ref={search} type="search" aria-label={`Search ${label}`} placeholder="Search by name…" value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0) }} className={`${inputClass} font-sans!`}
        aria-controls={listId} aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined} />
      <div id={listId} role="listbox" aria-label={`${label} options`} className="min-h-0 overflow-y-auto">
        {shown.map((o, i) => <button key={`${o.value}-${i}`} id={`${listId}-${i}`} type="button" role="option"
          aria-selected={o.value === String(props.value ?? select.current?.value ?? '')} disabled={o.disabled} tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}
          className={`flex w-full cursor-pointer items-center gap-2 rounded border-0 px-2.5 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45 ${active === i ? 'bg-accent/15' : 'bg-transparent'} ${o.value === select.current?.value ? 'text-accent' : 'text-ink'}`}>
          <span className="w-4 shrink-0" aria-hidden="true">{o.value === select.current?.value ? '✓' : ''}</span>{o.label}
        </button>)}
        {!shown.length && <p role="status" className="m-0 px-2.5 py-3 text-sm text-ink/55">No matching options</p>}
      </div>
    </div>, document.body)}
  </>
}
