import { useCallback, useState } from 'react'

type History<T> = { past: T[]; present: T; future: T[] }

// Value with undo/redo. `begin` snapshots before a gesture (e.g. a drag)
// whose intermediate `replace` calls must undo as one step.
export function useUndoable<T>(initial: T) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] })
  const begin = useCallback(() => setH(s => ({ past: [...s.past, s.present], present: s.present, future: [] })), [])
  const replace = useCallback((next: T | ((value: T) => T)) => setH(s => ({ ...s, present: typeof next === 'function' ? (next as (value: T) => T)(s.present) : next })), [])
  const set = useCallback((next: T | ((value: T) => T)) => setH(s => ({ past: [...s.past, s.present], present: typeof next === 'function' ? (next as (value: T) => T)(s.present) : next, future: [] })), [])
  const undo = useCallback(() => setH(s => s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future] } : s), [])
  const redo = useCallback(() => setH(s => s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s), [])
  return { value: h.present, set, begin, replace, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}

// Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z (or Ctrl+Y) redoes. Inside `scope` or
// any [data-undo-scope] element every control is covered, including number
// fields; other text fields keep the browser's own undo.
export function undoShortcut(e: KeyboardEvent, scope: HTMLElement | null, undo: () => void, redo: () => void) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return
  const target = e.target instanceof HTMLElement ? e.target : null
  const inScope = !!target && (!!scope?.contains(target) || !!target.closest('[data-undo-scope]'))
  if (!inScope && target?.closest('input, textarea, select, [contenteditable=true]')) return
  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo() }
}
