import type { ReactNode } from 'react'

type CardProps = {
  children: ReactNode
  className?: string
  onClick?: () => void
}

/** Плотная поверхность контента: приподнятый блок со скруглением и тонкой рамкой. */
export function Card({ children, className = '', onClick }: CardProps) {
  const base = `rounded-2xl border border-line bg-surface ${className}`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} block w-full cursor-pointer text-left transition hover:border-line-strong`}>
        {children}
      </button>
    )
  }
  return <div className={base}>{children}</div>
}
