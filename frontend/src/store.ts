import { create } from 'zustand'
import { api, openEvents, type BusEvent, type Device, type Family, type Notification, type Rule } from './api'

type State = {
  devices: Device[]
  families: Family[]
  rules: Rule[]
  events: BusEvent[]
  notifications: Notification[]
  error: string | null
  load: () => Promise<void>
  connect: () => () => void
  reloadDevices: () => Promise<void>
  reloadRules: () => Promise<void>
  setError: (e: string | null) => void
}

// Номер последнего запущенного запроса устройств: ответ более старого запроса не должен затереть свежий.
let devicesSeq = 0
let devicesTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>((set, get) => ({
  devices: [],
  families: [],
  rules: [],
  events: [],
  notifications: [],
  error: null,

  load: async () => {
    const seq = ++devicesSeq
    const [devices, families, rules, events, notifications] = await Promise.all([
      api.devices(),
      api.families(),
      api.rules(),
      api.events(150),
      api.notifications(),
    ])
    // Устройства применяем только если после этого не стартовал более новый запрос.
    set(seq === devicesSeq ? { devices, families, rules, events, notifications } : { families, rules, events, notifications })
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
      set((s) => ({ events: [...s.events.slice(-299), e] }))
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
