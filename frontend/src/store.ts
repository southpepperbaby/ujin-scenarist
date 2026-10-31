import { create } from 'zustand'

import { api, openEvents, type BusEvent, type Device, type Family, type Notification, type Rule } from './api'
import { isTelemetry, resetTelemetry } from './shared/telemetry'
import { toastError } from './shared/toast'

/** Сколько держим каждого вида событий: телеметрия идёт отдельным буфером и не вытесняет важное. */
const EVENTS_KEEP = 300
const NOTIFICATIONS_KEEP = 200
const SEEN_KEY = 'homie.seenTs'

type State = {
  devices: Device[]
  families: Family[]
  rules: Rule[]
  events: BusEvent[]
  telemetry: BusEvent[]
  notifications: Notification[]
  /** Первая загрузка завершилась (данными или демо-набором): до этого пустой список значит «ещё грузим». */
  loaded: boolean
  /** Бэкенд недоступен, показан демо-набор: команды устройствам применяем локально. */
  demo: boolean
  /** Время последнего просмотра вкладки «События» жителем: всё, что новее, считается непрочитанным. */
  seenTs: number
  load: () => Promise<void>
  connect: () => () => void
  reloadDevices: () => Promise<void>
  reloadRules: () => Promise<void>
  markSeen: () => void
  /** Значение сигнала прямо в состоянии: подтверждённая команда или демо-режим, не дожидаясь шины. */
  setSignal: (deviceId: string, signal: string, value: number | string) => void
}

/** Делит загруженные события на важные и телеметрию; упавший запрос оставляет прежние буферы. */
function splitEvents(
  loaded: PromiseSettledResult<BusEvent[]>,
  devices: PromiseSettledResult<Device[]>,
  prev: Pick<State, 'events' | 'telemetry' | 'devices'>,
  before: Pick<State, 'events' | 'telemetry'>,
): Pick<State, 'events' | 'telemetry'> {
  if (loaded.status !== 'fulfilled') return { events: prev.events, telemetry: prev.telemetry }
  const known = devices.status === 'fulfilled' ? devices.value : prev.devices
  // История разбирается заново целиком: учёт дребезга начинаем с нуля, иначе события посчитаются дважды.
  resetTelemetry()
  const noisy = loaded.value.map((event) => isTelemetry(event, known))
  // События, пришедшие по шине, пока шёл запрос, могут не попасть в снимок: дописываем их, а не теряем.
  // Отбираем по месту в буфере (всё после последнего события на момент запроса), а не по seq:
  // перезапущенный бэкенд нумерует заново, и старая лента иначе целиком приклеилась бы к новой.
  const inSnapshot = new Set(loaded.value.map((e) => e.seq))
  const fresh = (list: BusEvent[], marker: BusEvent | undefined) => {
    const start = marker ? list.lastIndexOf(marker) + 1 : 0
    return list.slice(start).filter((e) => !inSnapshot.has(e.seq))
  }
  return {
    events: [...loaded.value.filter((_, i) => !noisy[i]), ...fresh(prev.events, before.events.at(-1))].slice(
      -EVENTS_KEEP,
    ),
    telemetry: [
      ...loaded.value.filter((_, i) => noisy[i]),
      ...fresh(prev.telemetry, before.telemetry.at(-1)),
    ].slice(-EVENTS_KEEP),
  }
}

/** Новое значение сигнала. Если ничего не поменялось, возвращает тот же массив, чтобы не будить подписчиков. */
function applySignal(devices: Device[], e: BusEvent): Device[] {
  if (e.value === undefined) return devices
  const index = devices.findIndex((d) => d.id === e.device_id)
  if (index < 0) return devices
  const device = devices[index]
  if (!device) return devices
  const signalIndex = device.signals.findIndex((sg) => sg.name === e.signal)
  const signal = device.signals[signalIndex]
  if (!signal || signal.value === e.value) return devices
  const signals = device.signals.slice()
  signals[signalIndex] = { ...signal, value: e.value }
  const next = devices.slice()
  next[index] = { ...device, signals }
  return next
}

/** Событие шины notify несёт объект уведомления целиком (engine.notify); id и уровень подстрахованы. */
function toNotification(e: BusEvent): Notification {
  const raw = e as BusEvent & Partial<Notification>
  return {
    id: raw.id ?? `live-${e.seq}`,
    ts: raw.ts,
    target: raw.target === 'concierge' ? 'concierge' : 'resident',
    level: raw.level === 'critical' || raw.level === 'warning' ? raw.level : 'info',
    message: raw.message ?? '',
    rule_id: raw.rule_id ?? null,
    rule_title: raw.rule_title ?? null,
    ticket_id: raw.ticket_id,
    incident_id: raw.incident_id,
  }
}

// Номер последнего запущенного запроса: ответ более старого запроса не должен затереть свежий.
let devicesSeq = 0
let rulesSeq = 0

export const useStore = create<State>((set, get) => ({
  devices: [],
  families: [],
  rules: [],
  events: [],
  telemetry: [],
  notifications: [],
  loaded: false,
  demo: false,
  seenTs: Number(localStorage.getItem(SEEN_KEY) ?? 0),

  load: async () => {
    const seq = ++devicesSeq
    const rulesRequest = ++rulesSeq
    const { events: eventsBefore, telemetry: telemetryBefore } = get()
    const results = await Promise.allSettled([
      api.devices(),
      api.families(),
      api.rules(),
      api.events(EVENTS_KEEP),
      api.notifications(),
    ] as const)
    // Бэкенд недоступен целиком: пусть вызывающий решает (демо-режим при старте).
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length === results.length) throw (failed[0] as PromiseRejectedResult).reason
    // Один упавший запрос не роняет остальное: его срез остаётся прежним, человек видит предупреждение.
    const [devices, families, rules, events, notifications] = results
    const s = get()
    const ok = <T,>(r: PromiseSettledResult<T>, prev: T) => (r.status === 'fulfilled' ? r.value : prev)
    set({
      devices: seq === devicesSeq ? ok(devices, s.devices) : s.devices,
      families: ok(families, s.families),
      rules: rulesRequest === rulesSeq ? ok(rules, s.rules) : s.rules,
      ...splitEvents(events, devices, s, { events: eventsBefore, telemetry: telemetryBefore }),
      notifications: ok(notifications, s.notifications),
      loaded: true,
    })
    if (failed.length > 0) {
      toastError(`Часть данных не загрузилась (${failed.length} из ${results.length}), остальное работает`)
    }
  },

  reloadDevices: async () => {
    const seq = ++devicesSeq
    const devices = await api.devices()
    if (seq === devicesSeq) set({ devices })
  },
  reloadRules: async () => {
    const seq = ++rulesSeq
    const rules = await api.rules()
    if (seq === rulesSeq) set({ rules })
  },
  setSignal: (deviceId, signal, value) =>
    set((s) => ({
      devices: applySignal(s.devices, { seq: 0, ts: Date.now() / 1000, kind: 'signal', device_id: deviceId, signal, value }),
    })),
  markSeen: () => {
    const last = get().notifications.at(-1)?.ts ?? 0
    if (last <= get().seenTs) return
    localStorage.setItem(SEEN_KEY, String(last))
    set({ seenTs: last })
  },

  connect: () => {
    let devicesTimer: ReturnType<typeof setTimeout> | undefined
    const stop = openEvents(
      (e) => {
        const telemetry = isTelemetry(e, get().devices)
        set((s) => {
          const patch: Partial<State> = telemetry
            ? { telemetry: [...s.telemetry.slice(1 - EVENTS_KEEP), e] }
            : { events: [...s.events.slice(1 - EVENTS_KEEP), e] }
          if (e.kind === 'signal' && e.device_id) {
            const devices = applySignal(s.devices, e)
            if (devices !== s.devices) patch.devices = devices
          }
          if (e.kind === 'notify') {
            patch.notifications = [...s.notifications.slice(1 - NOTIFICATIONS_KEEP), toNotification(e)]
          }
          return patch
        })
        if (e.kind === 'device') {
          // Всплеск device-событий схлопываем в один запрос.
          clearTimeout(devicesTimer)
          devicesTimer = setTimeout(() => void guard(get().reloadDevices()), 150)
        }
      },
      () => void guard(get().load()),
    )
    return () => {
      clearTimeout(devicesTimer)
      stop()
    }
  },
}))

export function deviceById(devices: Device[], id: string) {
  return devices.find((d) => d.id === id)
}

export function signalTitle(devices: Device[], deviceId: string, signal: string) {
  return deviceById(devices, deviceId)?.signals.find((s) => s.name === signal)?.title ?? signal
}

/** Значение сигнала словами: подпись из layout, иначе число с округлением и единицей. */
export function valueLabel(devices: Device[], deviceId: string, signal: string, value: unknown) {
  const sig = deviceById(devices, deviceId)?.signals.find((s) => s.name === signal)
  const label = sig?.layout?.[String(value)]
  if (label) return label
  if (value === null || value === undefined || value === '') return '—'
  const shown = typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value)
  return `${shown}${sig?.measure ? ' ' + sig.measure : ''}`
}

/** Ошибку из API показываем тостом, а не роняем экран. */
export async function guard<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch (e) {
    toastError((e as Error).message)
    return undefined
  }
}
