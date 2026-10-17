import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from './Button'

// A button shown as an icon alone. The label is its accessible name and its tooltip.
export function IconButton({ label, icon, title, className = '', ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & { label: string; icon: ReactNode; variant?: 'primary' | 'secondary' }) {
  return <Button aria-label={label} title={title ?? label} className={`px-2.5! ${className}`} {...rest}>{icon}</Button>
}
