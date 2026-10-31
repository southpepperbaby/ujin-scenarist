import type { ReactNode } from 'react'

type ChipProps = {
  children: ReactNode
  active?: boolean
  onClick?: () => void
}

export function Chip({ children, active = false, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-body font-medium transition ${
        active ? 'bg-select text-select-ink' : 'bg-raised text-ink-dim hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
