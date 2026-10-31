import { useEffect, useRef, useState } from 'react'

import { Icon, type IconName } from './Icon'

export type DropdownOption<T extends string> = { value: T; label: string; hint?: string }

type DropdownProps<T extends string> = {
  label: string
  icon: IconName
  value: T
  options: DropdownOption<T>[]
  onChange: (next: T) => void
}

/** Плашка-выбор: показывает текущее значение, по нажатию раскрывает список под собой. */
export function Dropdown<T extends string>({ label, icon, value, options, onChange }: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
        className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:border-accent/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon name={icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold tracking-widest text-ink-mute">{label}</span>
          <span className="block truncate text-[14px] font-medium">{current?.label ?? '—'}</span>
        </span>
        <Icon
          name="chevronDown"
          size={18}
          className={`shrink-0 text-ink-mute transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Позиция — на обёртке: .glass сам ставит position: relative и перебил бы absolute. */}
      {open && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1.5">
          <ul role="listbox" className="glass glass-strong max-h-72 overflow-y-auto rounded-2xl p-1.5">
            {options.map((option) => {
              const selected = option.value === value
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition ${
                      selected ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-raised/70'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{option.label}</span>
                      {option.hint && <span className="block truncate text-[12px] text-ink-mute">{option.hint}</span>}
                    </span>
                    {selected && <Icon name="check" size={16} className="shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
