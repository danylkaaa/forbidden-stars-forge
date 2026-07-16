import type { ReactNode } from 'react'

const variants = {
  'solid-accent': 'bg-accent-800 text-accent-100',
  'outline-accent': 'border border-accent text-accent',
  neutral: 'bg-neutral-800 text-neutral-100',
  warn: 'bg-warn/15 text-warn',
} as const

export function Tag({ children, variant }: { children: ReactNode; variant: keyof typeof variants }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] tracking-wide whitespace-nowrap ${variants[variant]}`}>
      {children}
    </span>
  )
}
