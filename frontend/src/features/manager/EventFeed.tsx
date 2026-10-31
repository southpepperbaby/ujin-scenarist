import { memo, useMemo, useRef, useState } from 'react'

import type { BusEvent, Device } from '../../api'
import { formatClockSeconds } from '../../shared/format'
import { showValue } from '../../shared/device-values'
import { Icon } from '../../shared/ui/Icon'

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
/** Сколько строк плоской ленты и сколько карточек цепочек рисуем. */
const SHOWN_ROWS = 200
const SHOWN_CHAINS = 60

/** События одной цепочки идут друг за другом не дольше этой паузы: протечка → правило → клапан → заявка. */
const CHAIN_GAP_S = 2

function label(event: BusEvent, byId: Map<string, Device>): string {
  const device = event.device_id ? byId.get(event.device_id) : undefined
  if (event.kind === 'signal') {
    const signal = device?.signals.find((item) => item.name === event.signal)
    const show = (value: unknown) => {
      if (value === undefined || value === null) return '—'
      return signal ? showValue({ value: value as number, layout: signal.layout, measure: signal.measure }) : String(value)
    }
    const head = `${device?.title ?? event.device_id} · ${event.title ?? event.signal}`
    return event.prev === undefined ? `${head}: ${show(event.value)}` : `${head}: ${show(event.prev)} → ${show(event.value)}`
  }
  if (event.kind === 'notify') {
    return `${event.target === 'concierge' ? 'Консьержу' : 'Жителю'}: ${event.message}`
  }
  return event.message ?? `${device?.title ?? event.device_id ?? ''} ${event.action ?? ''}`.trim()
}

/** Служебное, что человеку в ленте не нужно: лог эмулятора, обмен с Ujin, «правило запущено» до итога. */
function noise(event: BusEvent): boolean {
  return event.kind === 'log' || event.kind === 'ujin' || (event.kind === 'rule' && event.phase === 'running')
}

/** Склеивает события, идущие подряд, в цепочки; у инцидента в цепочке остаётся только последняя фаза. */
function chains(events: BusEvent[]): BusEvent[][] {
  const out: BusEvent[][] = []
  for (const event of events) {
    const last = out.at(-1)
    const tail = last?.at(-1)
    if (last && tail && event.ts - tail.ts <= CHAIN_GAP_S) last.push(event)
    else out.push([event])
  }
  return out.map((chain) => {
    const lastPhase = new Map<string, number>()
    chain.forEach((e) => e.incident_id && lastPhase.set(e.incident_id, e.seq))
    return chain.filter((e) => !e.incident_id || lastPhase.get(e.incident_id) === e.seq)
  })
}

function tone(chain: BusEvent[]): string {
  if (chain.some((e) => e.kind === 'incident' || e.level === 'critical')) return 'border-sev-crit/40 bg-sev-crit-soft/40'
  if (chain.some((e) => e.kind === 'ticket' || e.level === 'warning')) return 'border-sev-major/40 bg-sev-major-soft/40'
  if (chain.some((e) => e.kind === 'rule')) return 'border-accent/30 bg-accent/5'
  return 'border-line bg-raised/40'
}

type EventFeedProps = {
  /** Действия, переходы состояний, правила, уведомления. */
  events: BusEvent[]
  /** Тиковые показания датчиков: по умолчанию скрыты. */
  telemetry: BusEvent[]
  devices: Device[]
}

/**
 * Живая лента шины, новые сверху. По умолчанию события, идущие подряд, склеены в карточку цепочки:
 * «протечка → правило → клапан закрыт → консьержу → заявка». С телеметрией лента плоская.
 * Стоит отлистать вниз или нажать паузу — лента замирает; новые копятся и возвращаются по кнопке.
 * Новая карточка въезжает сама (.enter), цепочка с инцидентом подсвечивается один раз.
 */
export const EventFeed = memo(function EventFeed({ events, telemetry, devices }: EventFeedProps) {
  const listRef = useRef<HTMLDivElement>(null)
  // Снимок на момент паузы: строки не уезжают и не вытесняются, пока их читают.
  const [frozen, setFrozen] = useState<BusEvent[] | null>(null)
  const [withTelemetry, setWithTelemetry] = useState(false)
  const [deviceId, setDeviceId] = useState('')

  const live = useMemo(
    () => (withTelemetry ? [...events, ...telemetry].sort((a, b) => a.seq - b.seq) : events),
    [withTelemetry, events, telemetry],
  )
  const byId = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices])
  const source = frozen ?? live
  const shown = useMemo(() => source.filter((event) => !noise(event)), [source])
  const frozenTop = frozen?.at(-1)?.seq ?? 0
  const pending = frozen ? live.filter((event) => event.seq > frozenTop && !noise(event)).length : 0

  const rows = useMemo(() => {
    const mine = (event: BusEvent) => !deviceId || event.device_id === deviceId
    if (withTelemetry) return { flat: shown.filter(mine).slice(-SHOWN_ROWS).reverse(), groups: [] }
    return {
      flat: [],
      groups: chains(shown)
        .filter((chain) => chain.some(mine))
        .slice(-SHOWN_CHAINS)
        .reverse(),
    }
  }, [shown, withTelemetry, deviceId])

  const freeze = () => setFrozen((current) => current ?? live)
  const goLive = () => {
    setFrozen(null)
    listRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-2 text-meta">
        <button
          type="button"
          onClick={frozen === null ? freeze : goLive}
          aria-pressed={frozen !== null}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 font-medium text-ink-dim transition hover:text-ink"
        >
          {frozen === null && <span className="size-1.5 animate-pulse rounded-full bg-ok" aria-hidden="true" />}
          {frozen === null ? 'Вживую · пауза' : 'Продолжить'}
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
        <select
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 py-1 text-ink-dim"
          aria-label="Фильтр по устройству"
        >
          <option value="">Все устройства</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.title}
            </option>
          ))}
        </select>
      </div>

      <div className="relative min-h-0 flex-1">
        {pending > 0 && (
          <button
            type="button"
            onClick={goLive}
            className="enter absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent px-3 py-1 text-meta font-medium text-accent-ink shadow-md"
          >
            <Icon name="arrowUp" size={13} />
            {pending} новых
          </button>
        )}
        <div
          ref={listRef}
          tabIndex={0}
          aria-label="Лента событий шины"
          onScroll={(event) => {
            if (event.currentTarget.scrollTop > LIVE_EDGE) freeze()
          }}
          className="scroll-slim h-full overflow-y-auto px-4 py-3 outline-none"
        >
          {withTelemetry ? (
            <ul className="space-y-1 font-mono text-meta">
              {rows.flat.map((event) => (
                <li key={event.seq} className={`enter ${KIND_COLOR[event.kind] ?? 'text-ink-dim'}`}>
                  <span className="tabular text-ink-mute">{formatClockSeconds(event.ts)} </span>
                  {label(event, byId)}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2">
              {rows.groups.map((chain) => {
                const head = chain[0]
                if (!head) return null
                return (
                  <li
                    key={head.seq}
                    className={`enter rounded-xl border px-3 py-2.5 text-body leading-snug ${tone(chain)} ${
                      chain.some((e) => e.kind === 'incident') ? 'animate-flash' : ''
                    }`}
                  >
                    <p className="tabular mb-1 text-caption text-ink-mute">{formatClockSeconds(head.ts)}</p>
                    <ol className="space-y-0.5">
                      {chain.map((event, index) => (
                        <li
                          key={event.seq}
                          className={index === 0 ? 'font-medium text-ink' : (KIND_COLOR[event.kind] ?? 'text-ink-dim')}
                        >
                          {index > 0 && <span className="text-ink-mute">→ </span>}
                          {label(event, byId)}
                        </li>
                      ))}
                    </ol>
                  </li>
                )
              })}
            </ul>
          )}
          {shown.length === 0 && telemetry.length === 0 && (
            <p className="text-meta text-ink-mute">Шина молчит: запустите бэкенд, чтобы увидеть живые события.</p>
          )}
          {shown.length === 0 && telemetry.length > 0 && (
            <p className="text-meta text-ink-mute">
              Пока только телеметрия датчиков. Подайте воздействие на устройство слева, например «wet ▲» у датчика
              протечки, и цепочка появится здесь.
            </p>
          )}
        </div>
      </div>
    </div>
  )
})
