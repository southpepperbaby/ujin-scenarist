import type { ReactNode } from 'react'

import { Icon, type IconName } from './Icon'

type ButtonVariant = 'primary' | 'bright' | 'secondary' | 'ghost' | 'danger'

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  icon?: IconName
  full?: boolean
  className?: string
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  /** Яркий оранжевый палитры (#DD8607) для главного действия страницы; текст тёмно-коричневый ради контраста. */
  bright: 'bg-accent-glow text-ink hover:brightness-105',
  secondary: 'bg-raised text-ink border border-line hover:border-line-strong',
  ghost: 'text-ink-dim hover:text-ink hover:bg-raised',
  danger: 'bg-sev-crit-soft text-sev-crit border border-sev-crit/35 hover:brightness-125',
}

export function Button({ children, onClick, variant = 'secondary', icon, full, className = '' }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
        VARIANTS[variant]
      } ${full ? 'w-full' : ''} ${className}`}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}
