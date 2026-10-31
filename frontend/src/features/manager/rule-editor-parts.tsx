import type { ReactNode } from 'react'

import { RemoveButton } from '../../shared/ui/DeleteButtons'

/** Блок правила «Когда / Если / То» с цветной полосой слева. */
export function Block({ label, hint, bar, children }: { label: string; hint: string; bar: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="relative rounded-xl border border-line bg-raised/40 p-3 pl-5">
      <span className={`absolute top-3 bottom-3 left-0 w-1 rounded-full ${bar}`} aria-hidden="true" />
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-meta text-ink-mute">{hint}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export function Row({ children, onRemove, removeLabel }: { children: ReactNode; onRemove?: () => void; removeLabel?: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {onRemove && (
        <span className="mt-0.5">
          <RemoveButton onClick={onRemove} label={removeLabel} />
        </span>
      )}
    </div>
  )
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-meta font-medium text-accent transition hover:bg-accent-soft"
    >
      {children}
    </button>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-field px-2 py-0.5 text-caption text-ink-dim">{children}</span>
}
