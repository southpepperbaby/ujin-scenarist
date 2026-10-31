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

export type DeviceEvent = { id: string; signal: string; value: string; title: string }

export type Device = {
  id: string
  family: string
  title: string
  model: string
  room: string
  scope: 'apartment' | 'building'
  ujin: { sn: string; ext: string } | null
  online: boolean
  inputs: string[]
  signals: SignalDecl[]
  events: DeviceEvent[]
}

export type Family = {
  family: string
  title: string
  model: string
  inputs: string[]
  declaration: Omit<SignalDecl, 'value'>[]
  events: DeviceEvent[]
}

export type Op = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'changed'

export type Trigger = { type: 'signal'; device_id: string; signal: string; op: Op; value: unknown }
export type Condition = { device_id: string; signal: string; op: Op; value: unknown }
export type Action =
  | { type: 'set_signal'; device_id: string; signal: string; value: unknown; delay_s?: number }
  | { type: 'notify'; target: 'resident' | 'concierge'; message: string; level: 'info' | 'warning' | 'critical'; delay_s?: number }
  | { type: 'dispatch'; category?: string | null; note?: string; delay_s?: number }

export type Rule = {
  id: string
  title: string
  description: string
  scope: 'apartment' | 'building'
  owner: 'resident' | 'uk'
  priority: number
  enabled: boolean
  status: 'draft' | 'checked' | 'tested' | 'active'
  cooldown_s: number
  trigger: Trigger
  conditions: Condition[]
  actions: Action[]
}

export type Notification = {
  id: string
  ts: number
  target: 'resident' | 'concierge'
  level: 'info' | 'warning' | 'critical'
  message: string
  rule_id: string | null
  rule_title: string | null
}

export type BusEvent = {
  seq: number
  ts: number
  kind: 'signal' | 'log' | 'device' | 'rule' | 'notify'
  device_id: string | null
  signal?: string
  value?: number | string
  prev?: number | string
  title?: string
  source?: string
  message?: string
  action?: string
  phase?: string
  rule_id?: string
  target?: string
  level?: string
  id?: string
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = await res.text()
    try {
      detail = JSON.parse(detail).detail ?? detail
    } catch {
      /* текст как есть */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const body = (data: unknown) => ({ body: JSON.stringify(data) })

export const api = {
  families: () => json<Family[]>('/api/families'),
  devices: () => json<Device[]>('/api/devices'),
  createDevice: (d: { family: string; title?: string; room?: string; scope?: string }) =>
    json<Device>('/api/devices', { method: 'POST', ...body(d) }),
  patchDevice: (id: string, patch: Partial<Pick<Device, 'title' | 'room' | 'scope' | 'online'>>) =>
    json<Device>(`/api/devices/${id}`, { method: 'PATCH', ...body(patch) }),
  deleteDevice: (id: string) => json(`/api/devices/${id}`, { method: 'DELETE' }),
  command: (id: string, signal: string, value: unknown) =>
    json(`/api/devices/${id}/command`, { method: 'POST', ...body({ signal, value }) }),
  inject: (id: string, input: string, value: unknown) =>
    json(`/api/devices/${id}/inject`, { method: 'POST', ...body({ input, value }) }),

  rules: () => json<Rule[]>('/api/rules'),
  createRule: (r: Rule) => json<Rule>('/api/rules', { method: 'POST', ...body(r) }),
  updateRule: (r: Rule) => json<Rule>(`/api/rules/${r.id}`, { method: 'PUT', ...body(r) }),
  deleteRule: (id: string) => json(`/api/rules/${id}`, { method: 'DELETE' }),
  runRule: (id: string) => json(`/api/rules/${id}/run`, { method: 'POST' }),
  exportRule: (id: string) => json<Record<string, unknown>>(`/api/rules/${id}/ujin`),

  notifications: () => json<Notification[]>('/api/notifications?limit=100'),
  events: (limit = 100) => json<BusEvent[]>(`/api/events?limit=${limit}`),
  sim: (patch: { running?: boolean; speed?: number }) => json('/api/sim', { method: 'POST', ...body(patch) }),
}

export function openEvents(onEvent: (e: BusEvent) => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  let ws: WebSocket | null = null
  let closed = false
  const connect = () => {
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onmessage = (m) => onEvent(JSON.parse(m.data))
    ws.onclose = () => {
      if (!closed) setTimeout(connect, 1000)
    }
  }
  connect()
  return () => {
    closed = true
    ws?.close()
  }
}
