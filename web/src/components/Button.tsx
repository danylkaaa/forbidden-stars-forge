import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant = 'secondary', className = '', ...rest }: Props) {
  const base =
    'inline-flex items-center justify-center gap-1.5 cursor-pointer font-medium text-sm px-3.5 py-2 rounded-md border bg-transparent disabled:opacity-45 disabled:cursor-not-allowed'
  const look =
    variant === 'primary'
      ? 'text-accent border-accent hover:bg-accent/10'
      : 'text-ink border-divider hover:bg-ink/5'
  return <button className={`${base} ${look} ${className}`} {...rest} />
}
