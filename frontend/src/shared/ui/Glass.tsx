import type { ReactNode } from 'react'

type GlassProps = {
  children: ReactNode
  /** accent — подложка с оранжевым отливом для главного блока экрана; solid — плотная поверхность контента. */
  tone?: 'plain' | 'accent' | 'strong' | 'solid'
  className?: string
  /** Карточка-ссылка: рендерится как <a>, работает с клавиатуры и открывается в новой вкладке. */
  href?: string
  onClick?: () => void
  label?: string
}

const TONES = {
  plain: 'glass',
  accent: 'glass glass-accent',
  strong: 'glass glass-strong',
  solid: 'surface',
}

/**
 * Поверхность liquid glass: размытие фона, бликовая кромка, мягкая тень.
 * Кликабельная карточка — настоящая кнопка или ссылка, а не div с onClick.
 */
export function Glass({ children, tone = 'plain', className = '', href, onClick, label }: GlassProps) {
  const base = `relative block rounded-2xl ${TONES[tone]} ${className}`
  const interactive = 'sheen lift press cursor-pointer text-left'
  if (href) {
    return (
      <a href={href} aria-label={label} className={`${base} ${interactive}`}>
        {children}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={`${base} ${interactive} w-full`}>
        {children}
      </button>
    )
  }
  return <div className={base}>{children}</div>
}
