import type { ReactNode } from 'react'

import { Icon, type IconName } from './Icon'

type EmptyStateProps = {
  icon: IconName
  title: string
  hint?: string
  /** Следующий шаг кнопкой, а не текстом: пустой экран подсказывает, что сделать. */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, hint, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-2 px-6 py-8 text-center ${className}`}>
      <span className="flex size-11 items-center justify-center rounded-2xl bg-raised text-ink-mute">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-body text-ink-mute">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
