import { useRef, type ReactNode } from 'react'

export function Dialog({
  title,
  titleExtra,
  width = 'min(620px,100%)',
  onBackdropClick,
  children,
}: {
  title: string
  titleExtra?: ReactNode
  width?: string
  // Called on a click outside the dialog box. Callers decide whether that
  // closes it (e.g. only when there are no unsaved changes).
  onBackdropClick?: () => void
  children: ReactNode
}) {
  // Only a press that both starts and ends on the backdrop counts, so a text
  // selection dragged out of the dialog doesn't close it.
  const pressedBackdrop = useRef(false)
  return (
    <div
      data-testid="dialog-backdrop"
      onMouseDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onBackdropClick?.()
        pressedBackdrop.current = false
      }}
      className="fixed inset-0 z-10 grid place-items-center overflow-y-auto bg-black/65 p-5 backdrop-blur-[2px]"
    >
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--color-accent-700),0_0_0_4px_var(--color-bg),0_0_0_5px_var(--color-accent-800),0_18px_50px_rgba(0,0,0,0.8)]"
        style={{ width }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-medium">{title}</h2>
          {titleExtra}
        </div>
        {children}
      </div>
    </div>
  )
}
