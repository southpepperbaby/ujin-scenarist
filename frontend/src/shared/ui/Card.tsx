import type { ReactNode } from 'react'

type CardProps = {
  children: ReactNode
  className?: string
  onClick?: () => void
}

/** Базовая поверхность тёмной темы: приподнятый блок со скруглением и тонкой рамкой. */
export function Card({ children, className = '', onClick }: CardProps) {
  const interactive = onClick ? 'cursor-pointer transition hover:border-line-strong' : ''
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-line bg-surface ${interactive} ${className}`}
    >
      {children}
    </div>
  )
}
