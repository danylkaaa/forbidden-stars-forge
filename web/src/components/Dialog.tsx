import type { ReactNode } from 'react'

export function Dialog({
  title,
  titleExtra,
  width = 'min(620px,100%)',
  children,
}: {
  title: string
  titleExtra?: ReactNode
  width?: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-10 grid place-items-center overflow-y-auto bg-neutral-900/50 p-5">
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--color-neutral-500),0_16px_40px_rgba(0,0,0,0.65)]"
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
