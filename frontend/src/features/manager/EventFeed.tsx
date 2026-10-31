import type { BusEvent, Device } from '../../api'
import { formatClockSeconds } from '../../shared/format'
import { showValue } from '../../shared/device-values'

const KIND_COLOR: Record<string, string> = {
  log: 'text-ink-mute',
  signal: 'text-ink-dim',
  device: 'text-sev-info',
  rule: 'text-accent',
  notify: 'text-sev-info',
  incident: 'text-sev-crit',
  ticket: 'text-sev-major',
  ujin: 'text-ink-mute',
}

function label(event: BusEvent, devices: Device[]): string {
  const device = devices.find((item) => item.id === event.device_id)
  if (event.kind === 'signal') {
    const signal = device?.signals.find((item) => item.name === event.signal)
    const show = (value: unknown) =>
      signal ? showValue({ value: value as number, layout: signal.layout, measure: signal.measure }) : String(value)
    return `${device?.title ?? event.device_id} · ${event.title ?? event.signal}: ${show(event.prev)} → ${show(event.value)}`
  }
  if (event.kind === 'notify') {
    return `${event.target === 'concierge' ? 'Консьержу' : 'Жителю'}: ${event.message}`
  }
  return event.message ?? `${device?.title ?? event.device_id ?? ''} ${event.action ?? ''}`.trim()
}

type EventFeedProps = {
  events: BusEvent[]
  devices: Device[]
}

export function EventFeed({ events, devices }: EventFeedProps) {
  return (
    <ul className="scroll-slim h-full space-y-1 overflow-y-auto px-5 py-3 font-mono text-[12px]">
      {[...events]
        .reverse()
        .slice(0, 200)
        .map((event) => (
          <li key={event.seq} className={KIND_COLOR[event.kind] ?? 'text-ink-dim'}>
            <span className="text-ink-mute">{formatClockSeconds(event.ts)} </span>
            {label(event, devices)}
          </li>
        ))}
      {events.length === 0 && (
        <li className="text-ink-mute">Шина молчит: запустите бэкенд, чтобы увидеть живые события.</li>
      )}
    </ul>
  )
}
