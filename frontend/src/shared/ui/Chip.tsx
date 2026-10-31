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
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
        active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink-dim hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
