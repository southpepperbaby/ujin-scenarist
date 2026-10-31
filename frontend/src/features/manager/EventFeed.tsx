import { useMemo, useRef, useState } from 'react'

import type { BusEvent, Device } from '../../api'
import { formatClockSeconds } from '../../shared/format'
import { showValue } from '../../shared/device-values'
import { SelectInput } from '../../shared/ui/Fields'

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

/** События одной цепочки идут друг за другом не дольше этой паузы: протечка → правило → клапан → заявка. */
const CHAIN_GAP_S = 2

function label(event: BusEvent, devices: Device[]): string {
  const device = devices.find((item) => item.id === event.device_id)
  if (event.kind === 'signal') {
    const signal = device?.signals.find((item) => item.name === event.signal)
    const show = (value: unknown) =>
      signal ? showValue({ value: value as number, layout: signal.layout, measure: signal.measure }) : String(value)
    const verb = event.source === 'command' ? 'команда' : ''
    return `${device?.title ?? event.device_id} · ${verb ? verb + ' ' : ''}${event.title ?? event.signal}: ${show(event.prev)} → ${show(event.value)}`
  }
  if (event.kind === 'notify') {
    return `${event.target === 'concierge' ? 'Консьержу' : 'Жителю'}: ${event.message}`
  }
  return event.message ?? `${device?.title ?? event.device_id ?? ''} ${event.action ?? ''}`.trim()
}

/** Склеивает события, идущие подряд, в цепочки; в цепочке у инцидента остаётся только последняя фаза. */
function chains(events: BusEvent[]): BusEvent[][] {
  const out: BusEvent[][] = []
  for (const event of events) {
    const last = out.at(-1)
    if (last && event.ts - last[last.length - 1].ts <= CHAIN_GAP_S) last.push(event)
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
  events: BusEvent[]
  /** Отдельный буфер важного: телеметрия не вытесняет его из 300 последних событий. */
  keyEvents: BusEvent[]
  devices: Device[]
}

export function EventFeed({ events, keyEvents, devices }: EventFeedProps) {
  const [all, setAll] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  // Пока курсор над лентой, она не двигается: можно спокойно дочитать.
  const [paused, setPaused] = useState(false)
  const frozen = useRef({ events, keyEvents })
  if (!paused) frozen.current = { events, keyEvents }
  const source = all ? frozen.current.events : frozen.current.keyEvents

  const visible = useMemo(
    () => (all ? source.filter((e) => !deviceId || e.device_id === deviceId) : source),
    [source, all, deviceId],
  )

  const groups = useMemo(() => {
    if (all) return []
    const grouped = chains(visible)
    return (deviceId ? grouped.filter((chain) => chain.some((e) => e.device_id === deviceId)) : grouped)
      .reverse()
      .slice(0, 60)
  }, [visible, all, deviceId])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-[12px]">
        <div className="flex rounded-lg border border-line p-0.5">
          {[
            [false, 'Важное'],
            [true, 'Все сигналы'],
          ].map(([value, text]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setAll(value as boolean)}
              className={`rounded-md px-2.5 py-1 ${all === value ? 'bg-accent text-accent-ink' : 'text-ink-dim hover:text-ink'}`}
            >
              {text as string}
            </button>
          ))}
        </div>
        <SelectInput className="min-w-0 flex-1 py-1 text-[12px]" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">Все устройства</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.title}
            </option>
          ))}
        </SelectInput>
        {paused && <span className="text-ink-mute">пауза</span>}
      </div>

      <div
        className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-3"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {all ? (
          <ul className="space-y-1 font-mono text-[12px]">
            {[...visible]
              .reverse()
              .slice(0, 200)
              .map((event) => (
                <li key={event.seq} className={KIND_COLOR[event.kind] ?? 'text-ink-dim'}>
                  <span className="text-ink-mute">{formatClockSeconds(event.ts)} </span>
                  {label(event, devices)}
                </li>
              ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {groups.map((chain) => (
              <li key={chain[0].seq} className={`rounded-xl border px-3 py-2.5 text-[12.5px] leading-snug ${tone(chain)}`}>
                <p className="mb-1 text-[11px] text-ink-mute">{formatClockSeconds(chain[0].ts)}</p>
                <ol className="space-y-0.5">
                  {chain.map((event, index) => (
                    <li key={event.seq} className={index === 0 ? 'font-medium text-ink' : KIND_COLOR[event.kind] ?? 'text-ink-dim'}>
                      {index > 0 && <span className="text-ink-mute">→ </span>}
                      {label(event, devices)}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
        {frozen.current.events.length === 0 && (
          <p className="text-[12px] text-ink-mute">Шина молчит: запустите бэкенд, чтобы увидеть живые события.</p>
        )}
        {frozen.current.events.length > 0 && !all && groups.length === 0 && (
          <p className="text-[12px] text-ink-mute">
            Важного пока не было. Нажмите воздействие на карточке устройства, например «wet ▲» у датчика протечки.
          </p>
        )}
      </div>
    </div>
  )
}
