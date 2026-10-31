import type { ReactNode } from 'react'

import { navigate } from '../../app/routing'

type PanelProps = {
  title: string
  children: ReactNode
  action?: { label: string; to: string }
}

export function Panel({ title, children, action }: PanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={() => navigate(action.to)}
            className="text-[13px] font-medium text-accent hover:brightness-110"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
