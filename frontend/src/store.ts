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

export const useStore = create<State>((set, get) => ({
  devices: [],
  families: [],
  rules: [],
  events: [],
  telemetry: [],
  notifications: [],
  error: null,

  load: async () => {
    const [devices, families, rules, events, notifications] = await Promise.all([
      api.devices(),
      api.families(),
      api.rules(),
      api.events(EVENTS_KEEP),
      api.notifications(),
    ])
    const noisy = events.map((e) => isTelemetry(e, devices))
    set({
      devices,
      families,
      rules,
      events: events.filter((_, i) => !noisy[i]),
      telemetry: events.filter((_, i) => noisy[i]),
      notifications,
    })
  },

  reloadDevices: async () => set({ devices: await api.devices() }),
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
      if (e.kind === 'device') get().reloadDevices()
      if (e.kind === 'notify') {
        set((s) => ({ notifications: [...s.notifications.slice(-199), e as unknown as Notification] }))
      }
    }),
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
