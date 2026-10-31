import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

const FIELD =
  'rounded-lg border border-line bg-field px-2.5 py-1.5 text-body text-ink outline-none transition placeholder:text-ink-mute focus:border-accent/60'

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${FIELD} ${className}`} />
}

export function SelectInput({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${FIELD} ${className}`}>
      {children}
    </select>
  )
}

/**
 * Подпись над полем формы. Для группы кнопок (Segmented) — group: тогда это не <label>,
 * иначе клик по подписи нажал бы первую кнопку группы.
 */
export function Field({
  label,
  hint,
  children,
  className = '',
  group = false,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
  group?: boolean
}) {
  const id = useId()
  if (group) {
    return (
      <div role="group" aria-labelledby={id} className={`block space-y-1 ${className}`}>
        <span id={id} className="block text-meta font-medium text-ink-dim">
          {label}
        </span>
        {children}
        {hint && <span className="block text-caption text-ink-mute">{hint}</span>}
      </div>
    )
  }
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-meta font-medium text-ink-dim">{label}</span>
      {children}
      {hint && <span className="block text-caption text-ink-mute">{hint}</span>}
    </label>
  )
}

/** Переключатель из двух-трёх вариантов в одну строку. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-field p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1 text-body transition ${
            value === option.value ? 'bg-select text-select-ink' : 'text-ink-dim hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-sev-crit/35 bg-sev-crit-soft px-3 py-2 text-body text-sev-crit">{children}</p>
  )
}
