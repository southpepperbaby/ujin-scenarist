export type SignalDecl = {
  name: string
  title: string
  control: string
  management: 'r' | 'rw' | 'w'
  kind: string
  group: 'property' | 'capability' | 'setting' | 'system'
  measure?: string
  min?: number
  max?: number
  layout?: Record<string, string>
  value: number | string
}

export type Device = {
  id: string
  family: string
  title: string
  model: string
  room: string
  scope: 'apartment' | 'building'
  ujin: { sn: string; ext: string } | null
  inputs: string[]
  signals: SignalDecl[]
}

export type BusEvent = {
  seq: number
  ts: number
  kind: 'signal' | 'log' | 'device' | 'rule' | 'incident'
  device_id: string | null
  signal?: string
  value?: number | string
  prev?: number | string
  title?: string
  source?: string
  message?: string
  action?: string
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  devices: () => json<Device[]>('/api/devices'),
  events: (limit = 100) => json<BusEvent[]>(`/api/events?limit=${limit}`),
  command: (id: string, signal: string, value: unknown) =>
    json(`/api/devices/${id}/command`, { method: 'POST', body: JSON.stringify({ signal, value }) }),
  inject: (id: string, input: string, value: unknown) =>
    json(`/api/devices/${id}/inject`, { method: 'POST', body: JSON.stringify({ input, value }) }),
  sim: (patch: { running?: boolean; speed?: number }) =>
    json('/api/sim', { method: 'POST', body: JSON.stringify(patch) }),
}

export function openEvents(onEvent: (e: BusEvent) => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws`)
  ws.onmessage = (m) => onEvent(JSON.parse(m.data))
  return () => ws.close()
}
