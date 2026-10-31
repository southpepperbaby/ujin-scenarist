import { api, type Device, type SignalDecl } from '../../api'
import { showValue } from '../../shared/device-values'

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
            onClick={() => api.command(device.id, signal.name, Number(value))}
            className={`rounded-lg px-2 py-0.5 text-[12px] transition ${
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
        onClick={() => api.command(device.id, signal.name, 1)}
        className="rounded-lg bg-raised px-2 py-0.5 text-[12px] text-ink-dim transition hover:text-ink"
      >
        {signal.title}
      </button>
    )
  }

  if (writable) {
    return (
      <input
        defaultValue={String(signal.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          api.command(device.id, signal.name, Number((event.target as HTMLInputElement).value))
        }}
        className="w-20 rounded-lg border border-line bg-field px-2 py-0.5 text-right font-mono text-[12px] outline-none focus:border-accent/60"
      />
    )
  }

  return (
    <span className="font-mono text-[13px]">{showValue(signal)}</span>
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
            <p className="mb-1 text-[11px] tracking-widest text-ink-mute uppercase">{GROUP_TITLES[group]}</p>
            <div className="space-y-px">
              {rows.map((signal) => (
                <div
                  key={signal.name}
                  className="flex items-center gap-3 border-t border-line/70 py-1.5 first:border-t-0"
                >
                  <span className="min-w-0 flex-1 text-[13px] text-ink-dim">
                    {signal.title} <span className="text-[11px] text-ink-mute">{signal.name}</span>
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
