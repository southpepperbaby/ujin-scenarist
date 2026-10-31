import type { ReactNode } from 'react'

import { href } from '../../app/routing'

type PanelProps = {
  title: string
  children: ReactNode
  action?: { label: string; to: string }
}

/** Плотная панель контента: заголовок, ссылка «Все …» и тело. Стекло — только у навигации. */
export function Panel({ title, children, action }: PanelProps) {
  return (
    <section className="surface @container overflow-hidden rounded-2xl" aria-label={title}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && (
          <a href={href(action.to)} className="text-body font-medium text-accent hover:brightness-110">
            {action.label}
          </a>
        )}
      </div>
      {children}
    </section>
  )
}
