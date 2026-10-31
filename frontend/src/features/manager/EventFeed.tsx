import { useRef, useState } from 'react'

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

/** Сколько пикселей от верха ещё считается «смотрю вживую». */
const LIVE_EDGE = 8

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
  /** Действия, переходы состояний, правила, уведомления. */
  events: BusEvent[]
  /** Тиковые показания датчиков: по умолчанию скрыты. */
  telemetry: BusEvent[]
  devices: Device[]
}

/**
 * Живая лента шины, новые сверху. Стоит отлистать вниз или нажать паузу — лента замирает,
 * чтобы строки не уезжали из-под глаз; новые копятся и возвращаются по кнопке.
 */
export function EventFeed({ events, telemetry, devices }: EventFeedProps) {
  const listRef = useRef<HTMLUListElement>(null)
  // Снимок на момент паузы: строки не уезжают и не вытесняются, пока их читают.
  const [frozen, setFrozen] = useState<BusEvent[] | null>(null)
  const [withTelemetry, setWithTelemetry] = useState(false)

  const live = withTelemetry ? [...events, ...telemetry].sort((a, b) => a.seq - b.seq) : events
  const shown = frozen ?? live
  const frozenTop = frozen?.at(-1)?.seq ?? 0
  const pending = frozen ? live.filter((event) => event.seq > frozenTop).length : 0

  const freeze = () => setFrozen((current) => current ?? live)
  const goLive = () => {
    setFrozen(null)
    listRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-2 text-[12px]">
        <button
          type="button"
          onClick={frozen === null ? freeze : goLive}
          className="rounded-lg border border-line px-2.5 py-1 font-medium text-ink-dim transition hover:text-ink"
        >
          {frozen === null ? 'Пауза' : 'Продолжить'}
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 text-ink-mute">
          <input
            type="checkbox"
            checked={withTelemetry}
            onChange={(event) => {
              setWithTelemetry(event.target.checked)
              setFrozen(null)
            }}
            className="accent-[var(--color-accent)]"
          />
          Телеметрия датчиков
        </label>
      </div>

      <div className="relative min-h-0 flex-1">
        {pending > 0 && (
          <button
            type="button"
            onClick={goLive}
            className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[12px] font-medium text-accent-ink shadow-md"
          >
            ↑ {pending} новых
          </button>
        )}
        <ul
          ref={listRef}
          onScroll={(event) => {
            if (event.currentTarget.scrollTop > LIVE_EDGE) freeze()
          }}
          className="scroll-slim h-full space-y-1 overflow-y-auto px-5 py-3 font-mono text-[12px]"
        >
          {[...shown]
            .reverse()
            .slice(0, 200)
            .map((event) => (
              <li key={event.seq} className={KIND_COLOR[event.kind] ?? 'text-ink-dim'}>
                <span className="text-ink-mute">{formatClockSeconds(event.ts)} </span>
                {label(event, devices)}
              </li>
            ))}
          {shown.length === 0 && telemetry.length === 0 && (
            <li className="text-ink-mute">Шина молчит: запустите бэкенд, чтобы увидеть живые события.</li>
          )}
          {shown.length === 0 && telemetry.length > 0 && (
            <li className="text-ink-mute">
              Пока только телеметрия датчиков. Подайте воздействие на устройство слева — события появятся здесь.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
