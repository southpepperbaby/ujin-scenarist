import { useState } from 'react'

import { api, type Device, type SignalDecl } from '../../api'
import { showValue } from '../../shared/device-values'
import { toastError } from '../../shared/toast'
import { guard } from '../../store'

const send = (device: Device, signal: SignalDecl, value: number) => void guard(api.command(device.id, signal.name, value))

/** Число в границах сигнала или текст ошибки: пустое поле не уходит нулём, «abc» — null'ом. */
function parseCommand(raw: string, signal: SignalDecl): number | string {
  if (raw.trim() === '') return 'Введите значение'
  const value = Number(raw.replace(',', '.'))
  if (!Number.isFinite(value)) return 'Нужно число'
  if (signal.min !== undefined && value < signal.min) return `Не меньше ${signal.min}`
  if (signal.max !== undefined && value > signal.max) return `Не больше ${signal.max}`
  return value
}

/** Поле команды: пока его не правят, показывает живое значение с шины; Enter отправляет. */
function CommandInput({ device, signal }: { device: Device; signal: SignalDecl }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const submit = () => {
    if (draft === null) return
    const parsed = parseCommand(draft, signal)
    if (typeof parsed === 'string') {
      setProblem(parsed)
      toastError(`${signal.title}: ${parsed.toLowerCase()}`)
      return
    }
    setProblem('')
    setDraft(null)
    send(device, signal, parsed)
  }
  return (
    <input
      value={draft ?? String(signal.value)}
      inputMode="decimal"
      aria-label={`${signal.title}${signal.measure ? `, ${signal.measure}` : ''}`}
      aria-invalid={problem !== '' || undefined}
      title={problem || (signal.min !== undefined || signal.max !== undefined ? `от ${signal.min ?? '…'} до ${signal.max ?? '…'}` : undefined)}
      onChange={(event) => {
        setDraft(event.target.value)
        setProblem('')
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') submit()
        if (event.key === 'Escape') setDraft(null)
      }}
      className={`w-20 rounded-lg border bg-field px-2 py-0.5 text-right font-mono text-meta outline-none focus:border-accent/60 ${
        problem ? 'border-sev-crit' : 'border-line'
      }`}
    />
  )
}

const GROUP_TITLES: Record<string, string> = {
  property: 'Свойства',
  capability: 'Возможности',
  setting: 'Настройки',
}

const GROUPS = ['property', 'capability', 'setting'] as const
const MAX_INLINE_OPTIONS = 4

type DeviceSignalTableProps = {
  device: Device
  /** false — только чтение (экран «Устройства»), true — песочница с командами. */
  controls: boolean
}

function ValueCell({ device, signal, controls }: { device: Device; signal: SignalDecl; controls: boolean }) {
  const writable = controls && signal.management !== 'r'
  const options = signal.layout ? Object.entries(signal.layout) : []

  if (writable && options.length > 0 && options.length <= MAX_INLINE_OPTIONS) {
    return (
      <span className="flex flex-wrap justify-end gap-1">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={String(signal.value) === value}
            aria-label={`${signal.title}: ${label}`}
            onClick={() => send(device, signal, Number(value))}
            className={`rounded-lg px-2 py-0.5 text-meta transition ${
              String(signal.value) === value
                ? 'bg-accent text-accent-ink'
                : 'bg-raised text-ink-dim hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </span>
    )
  }

  if (writable && signal.control === 'push_time') {
    return (
      <button
        type="button"
        onClick={() => send(device, signal, 1)}
        className="rounded-lg bg-raised px-2 py-0.5 text-meta text-ink-dim transition hover:text-ink"
      >
        {signal.title}
      </button>
    )
  }

  if (writable) return <CommandInput device={device} signal={signal} />

  return (
    <span className="tabular font-mono text-body">{showValue(signal)}</span>
  )
}

export function DeviceSignalTable({ device, controls }: DeviceSignalTableProps) {
  return (
    <div className="space-y-3">
      {GROUPS.map((group) => {
        const rows = device.signals.filter((signal) => signal.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group}>
            <p className="mb-1 text-caption tracking-widest text-ink-mute uppercase">{GROUP_TITLES[group]}</p>
            <div className="space-y-px">
              {rows.map((signal) => (
                <div
                  key={signal.name}
                  className="flex items-center gap-3 border-t border-line/70 py-1.5 first:border-t-0"
                >
                  <span className="min-w-0 flex-1 text-body text-ink-dim">
                    {signal.title} <span className="text-caption text-ink-mute">{signal.name}</span>
                  </span>
                  <ValueCell device={device} signal={signal} controls={controls} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
