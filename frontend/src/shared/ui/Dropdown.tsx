import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { Icon, type IconName } from './Icon'

export type DropdownOption<T extends string> = { value: T; label: string; hint?: string }

type DropdownProps<T extends string> = {
  label: string
  icon: IconName
  value: T
  options: DropdownOption<T>[]
  onChange: (next: T) => void
}

/**
 * Плашка-выбор: показывает текущее значение, по нажатию раскрывает список под собой.
 * Клавиатура как у нативного select: стрелки, Home/End, Enter/Space выбирают, Esc и Tab закрывают.
 */
export function Dropdown<T extends string>({ label, icon, value, options, onChange }: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const current = options[currentIndex]

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    listRef.current?.focus()
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const openList = () => {
    setActive(currentIndex)
    setOpen(true)
  }

  const closeList = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const choose = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    closeList()
  }

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key] ?? active)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
      return
    }
    if (event.key === 'Escape') {
      // Esc закрывает только список: окно под ним (Modal) остаётся открытым.
      event.preventDefault()
      event.stopPropagation()
      closeList()
      return
    }
    if (event.key === 'Tab') closeList(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openList()
          }
        }}
        className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:border-accent/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon name={icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-semibold tracking-widest text-ink-mute">{label}</span>
          <span className="block truncate text-sm font-medium">{current?.label ?? '—'}</span>
        </span>
        <Icon
          name="chevronDown"
          size={18}
          className={`shrink-0 text-ink-mute transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className="glass glass-strong absolute top-full right-0 left-0 z-20 mt-1.5 max-h-72 overflow-y-auto rounded-2xl p-1.5 outline-none"
        >
          {options.map((option, index) => {
            const selected = option.value === value
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-body transition ${
                  selected ? 'bg-accent-soft text-accent' : 'text-ink'
                } ${index === active && !selected ? 'bg-raised/80' : ''} ${
                  index === active ? 'ring-1 ring-accent/40' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.hint && <span className="block truncate text-meta text-ink-mute">{option.hint}</span>}
                </span>
                {selected && <Icon name="check" size={16} className="shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
