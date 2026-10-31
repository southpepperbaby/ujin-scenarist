import type { ReactNode } from 'react'

type GlassProps = {
  children: ReactNode
  /** accent — подложка с оранжевым отливом для главного блока экрана. */
  tone?: 'plain' | 'accent' | 'strong'
  className?: string
  onClick?: () => void
}

const TONES = {
  plain: 'glass',
  accent: 'glass glass-accent',
  strong: 'glass glass-strong',
}

/** Поверхность liquid glass: размытие фона, бликовая кромка, мягкая тень. */
export function Glass({ children, tone = 'plain', className = '', onClick }: GlassProps) {
  const interactive = onClick ? 'sheen lift press cursor-pointer' : ''
  return (
    <div onClick={onClick} className={`relative rounded-2xl ${TONES[tone]} ${interactive} ${className}`}>
      {children}
    </div>
  )
}
