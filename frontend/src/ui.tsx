import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, ButtonHTMLAttributes } from 'react'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Tone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'violet'

const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONES[tone])}>
      {children}
    </span>
  )
}

export function Dot({ on }: { on: boolean }) {
  return <span className={cx('inline-block h-2 w-2 rounded-full', on ? 'bg-emerald-500' : 'bg-rose-500')} />
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md' }

export function Button({ variant = 'soft', size = 'md', className, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm',
    soft: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
  }[variant]
  const s = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  return (
    <button
      className={cx('inline-flex items-center gap-1.5 rounded-lg font-medium transition disabled:opacity-40', v, s, className)}
      {...rest}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>{children}</div>
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500',
        props.className,
      )}
    />
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500',
        props.className,
      )}
    />
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {right}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cx('max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function timeOf(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const FAMILY_ICON: Record<string, string> = {
  leak: '💧',
  valve: '🚰',
  counter: '📟',
  light: '💡',
  thermostat: '🌡️',
  fire: '🔥',
  barrier: '🚧',
  elevator: '🛗',
  ventilation: '🌀',
  hub: '📡',
}

export const GROUPS = [
  { key: 'property', title: 'Измеряет', hint: 'свойства, только чтение' },
  { key: 'capability', title: 'Команды', hint: 'чем можно управлять' },
  { key: 'setting', title: 'Настройки', hint: 'пороги, таймеры, периоды' },
] as const
