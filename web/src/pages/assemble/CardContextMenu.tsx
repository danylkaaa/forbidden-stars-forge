import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function CardContextMenu({ name, x, y, onDelete, onClose }: {
  name: string; x: number; y: number; onDelete: () => void; onClose: () => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const outside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); onClose() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [onClose])
  return createPortal(<div ref={menu} role="menu" aria-label={`Actions for ${name}`} onContextMenu={e => e.preventDefault()}
    className="fixed z-30 w-44 rounded-md border border-divider bg-surface p-1 shadow-xl"
    style={{ left: Math.max(8, Math.min(x, window.innerWidth - 184)), top: Math.max(8, Math.min(y, window.innerHeight - 56)) }}>
    <button type="button" role="menuitem" onClick={onDelete} className="w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-danger hover:bg-danger/10 focus:bg-danger/10 focus:outline-none">Delete</button>
  </div>, document.body)
}
