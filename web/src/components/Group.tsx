import type { ReactNode } from 'react'

// A titled, bordered group of related controls: the title sits in the border.
export function Group({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <fieldset className={`m-0 min-w-0 space-y-3 rounded-md border border-divider px-4 pb-4 pt-2 ${className}`}>
    <legend className="px-2 text-xs font-medium uppercase tracking-wider text-accent">{title}</legend>
    {children}
  </fieldset>
}
