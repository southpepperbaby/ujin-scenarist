import type { ReactNode } from 'react'

type BubbleProps = {
  children: ReactNode
  mine?: boolean
}

/** Реплика в чате: своя — сплошным акцентом, ответ системы — на стекле. */
export function Bubble({ children, mine = false }: BubbleProps) {
  return (
    <div
      className={`rise max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-snug whitespace-pre-line ${
        mine ? 'ml-auto bg-accent text-accent-ink' : 'glass text-ink'
      }`}
    >
      {children}
    </div>
  )
}
