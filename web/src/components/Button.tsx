import type { ButtonHTMLAttributes } from 'react'
import { buttonClass } from './buttonStyles'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant = 'secondary', className = '', ...rest }: Props) {
  return <button className={`${buttonClass(variant)} ${className}`} {...rest} />
}
