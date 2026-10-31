import { create } from 'zustand'
import { api, openEvents, type BusEvent, type Device, type Family, type Notification, type Rule } from './api'
import { isTelemetry } from './shared/telemetry'

/** Сколько держим каждого вида событий: телеметрия идёт отдельным буфером и не вытесняет важное. */
const EVENTS_KEEP = 300

type State = {
  devices: Device[]
  families: Family[]
  rules: Rule[]
  events: BusEvent[]
  telemetry: BusEvent[]
  notifications: Notification[]
  error: string | null
  load: () => Promise<void>
  connect: () => () => void
  reloadDevices: () => Promise<void>
  reloadRules: () => Promise<void>
  setError: (e: string | null) => void
}

/** Делит загруженные события на важные и телеметрию; упавший запрос оставляет прежние буферы. */
function splitEvents(
  loaded: PromiseSettledResult<BusEvent[]>,
  devices: PromiseSettledResult<Device[]>,
  prev: Pick<State, 'events' | 'telemetry' | 'devices'>,
): Pick<State, 'events' | 'telemetry'> {
  if (loaded.status !== 'fulfilled') return { events: prev.events, telemetry: prev.telemetry }
  const known = devices.status === 'fulfilled' ? devices.value : prev.devices
  const noisy = loaded.value.map((event) => isTelemetry(event, known))
  return {
    events: loaded.value.filter((_, i) => !noisy[i]),
    telemetry: loaded.value.filter((_, i) => noisy[i]),
  }
}

// Номер последнего запущенного запроса устройств: ответ более старого запроса не должен затереть свежий.
let devicesSeq = 0
let devicesTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>((set, get) => ({
  devices: [],
  families: [],
  rules: [],
  events: [],
  telemetry: [],
  notifications: [],
  error: null,

  load: async () => {
    const seq = ++devicesSeq
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
      // Устройства применяем только если после этого не стартовал более новый запрос.
      devices: seq === devicesSeq ? ok(devices, s.devices) : s.devices,
      families: ok(families, s.families),
      rules: ok(rules, s.rules),
      // Телеметрия идёт отдельным буфером и не вытесняет важные события.
      ...splitEvents(events, devices, s),
      notifications: ok(notifications, s.notifications),
    })
    if (failed.length > 0) {
      get().setError(`Часть данных не загрузилась (${failed.length} из ${results.length}), остальное работает`)
      setTimeout(() => get().setError(null), 4000)
    }
  },

  reloadDevices: async () => {
    const seq = ++devicesSeq
    const devices = await api.devices()
    if (seq === devicesSeq) set({ devices })
  },
  reloadRules: async () => set({ rules: await api.rules() }),
  setError: (error) => set({ error }),

  connect: () =>
    openEvents((e) => {
      if (isTelemetry(e, get().devices)) set((s) => ({ telemetry: [...s.telemetry.slice(1 - EVENTS_KEEP), e] }))
      else set((s) => ({ events: [...s.events.slice(1 - EVENTS_KEEP), e] }))
      if (e.kind === 'signal' && e.device_id) {
        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === e.device_id
              ? { ...d, signals: d.signals.map((sg) => (sg.name === e.signal ? { ...sg, value: e.value! } : sg)) }
              : d,
          ),
        }))
      }
      if (e.kind === 'device') {
        // Всплеск device-событий схлопываем в один запрос.
        clearTimeout(devicesTimer)
        devicesTimer = setTimeout(() => void guard(get().reloadDevices()), 150)
      }
      if (e.kind === 'notify') {
        set((s) => ({ notifications: [...s.notifications.slice(-199), e as unknown as Notification] }))
      }
    }, () => void guard(get().load())),
}))

export function deviceById(devices: Device[], id: string) {
  return devices.find((d) => d.id === id)
}

export function signalTitle(devices: Device[], deviceId: string, signal: string) {
  return deviceById(devices, deviceId)?.signals.find((s) => s.name === signal)?.title ?? signal
}

export function valueLabel(devices: Device[], deviceId: string, signal: string, value: unknown) {
  const sig = deviceById(devices, deviceId)?.signals.find((s) => s.name === signal)
  return sig?.layout?.[String(value)] ?? `${value}${sig?.measure ? ' ' + sig.measure : ''}`
}

/** Ошибку из API показываем тостом, а не роняем экран. */
export async function guard<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch (e) {
    useStore.getState().setError((e as Error).message)
    setTimeout(() => useStore.getState().setError(null), 4000)
    return undefined
  }
}
