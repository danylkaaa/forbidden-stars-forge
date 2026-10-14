import type { ReactNode } from 'react'
import { useId } from 'react'

export function Field({ label, children }: { label: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs mb-1 text-ink/70">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

export const inputClass =
  'w-full min-h-9 px-2.5 py-1.5 text-sm text-ink bg-bg border border-divider rounded-md ' +
  'focus:outline-none focus:border-accent font-mono'

export const selectClass =
  'w-full min-h-9 px-2.5 py-1.5 text-sm text-ink bg-bg border border-divider rounded-md focus:outline-none focus:border-accent'
