import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const FIELD =
  'rounded-lg border border-line bg-field px-2.5 py-1.5 text-[13px] text-ink outline-none transition placeholder:text-ink-mute focus:border-accent/60'

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

/** Подпись над полем формы. */
export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-[12px] font-medium text-ink-dim">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-mute">{hint}</span>}
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
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1 text-[13px] transition ${
            value === option.value ? 'bg-accent text-accent-ink' : 'text-ink-dim hover:text-ink'
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
    <p className="rounded-lg border border-sev-crit/35 bg-sev-crit-soft px-3 py-2 text-[13px] text-sev-crit">{children}</p>
  )
}
