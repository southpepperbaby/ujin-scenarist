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
  disabled?: boolean
  /** Идёт запрос: кнопка заблокирована и для мыши, и для клавиатуры, рядом крутится индикатор. */
  busy?: boolean
  type?: 'button' | 'submit'
  /** Подсказка клавиши справа от подписи. */
  kbd?: string
  label?: string
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  /** Яркий оранжевый палитры (#DD8607) для главного действия страницы; текст тёмно-коричневый ради контраста. */
  bright: 'bg-accent-glow text-[#401600] hover:brightness-105',
  secondary: 'bg-raised text-ink border border-line hover:border-line-strong',
  ghost: 'text-ink-dim hover:text-ink hover:bg-raised',
  danger: 'bg-sev-crit-soft text-sev-crit border border-sev-crit/35 hover:brightness-110',
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  icon,
  full,
  className = '',
  disabled,
  busy,
  type = 'button',
  kbd,
  label,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={busy ? undefined : onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={label}
      className={`press inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        VARIANTS[variant]
      } ${full ? 'w-full' : ''} ${className}`}
    >
      {busy ? <Spinner /> : icon && <Icon name={icon} size={18} />}
      {children}
      {kbd && <span className="kbd ml-1">{kbd}</span>}
    </button>
  )
}
