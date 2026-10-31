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
  alarms?: string[] // активные неисправности словами, есть и у своих типов
}

export type Family = {
  family: string
  title: string
  model: string
  inputs: string[]
  declaration: Omit<SignalDecl, 'value'>[]
  events: DeviceEvent[]
  /** Свой тип из конструктора: его можно править и удалять. */
  custom?: boolean
  spec?: DeviceTypeSpec | null
  /** Поведение своего типа простым языком, собрано бэкендом из behaviors. */
  behavior?: string[]
}

export type SignalGroup = 'property' | 'event' | 'command' | 'setting'
export type SignalValueType = 'number' | 'switch' | 'list' | 'text'

export type SignalSpec = {
  name: string
  title: string
  group: SignalGroup
  type: SignalValueType
  measure?: string
  min?: number | null
  max?: number | null
  layout?: Record<string, string> | null
  default?: number | string
  alarm_value?: number | string | null
}

export type Behavior =
  | { type: 'drift'; signal: string; step: number; noise: number }
  | { type: 'effect'; command: string; value: number | string | null; target: string; target_value: number | string | null; delay: number }
  | { type: 'threshold'; source: string; op: 'gt' | 'gte' | 'lt' | 'lte'; limit: number; target: string; value: number | string; else_value: number | string | null }

export type DeviceTypeSpec = { family: string; title: string; signals: SignalSpec[]; behaviors?: Behavior[] }

export type Op = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'changed'

export type Trigger = { type: 'signal'; device_id: string; signal: string; op: Op; value: unknown }
export type SignalCondition = { type?: 'signal'; device_id: string; signal: string; op: Op; value: unknown }
export type TimeCondition = { type: 'time'; start: string; end: string }
export type Condition = SignalCondition | TimeCondition
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
  ticket_id?: string
  incident_id?: string
}

export type BusEvent = {
  seq: number
  ts: number
  kind: 'signal' | 'log' | 'device' | 'rule' | 'notify' | 'incident' | 'ticket' | 'ujin'
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

export type IncidentVerdict = {
  source: string
  category: string
  level: number
  confidence: number
  damage: number | null
  people: number | null
  false_alarm: number | null
  reasons: string[]
}

export type Incident = {
  id: string
  ts: number
  device_id: string
  device_title: string
  room: string
  scope: 'apartment' | 'building'
  signal: string
  title: string
  status: 'confirmed' | 'dispatched' | 'logged'
  reasoning: string[]
  verdict: IncidentVerdict | null
  decision: string | null
  ticket_id: string | null
  rule_id: string | null
}

/** Ручная заявка из кабинета УК; send: false сохраняет черновик. */
export type TicketDraft = {
  category: string
  level: number
  title: string
  description: string
  device_id: string | null
  send: boolean
}

export type TicketStatus = 'draft' | 'new' | 'accepted' | 'in_progress' | 'done' | 'closed' | 'cancelled'

export type Ticket = {
  id: string
  created: number
  status: TicketStatus
  category: string
  level: number
  title: string
  description: string
  address: string
  device_id: string | null
  incident_id: string | null
  rule_id: string | null
  contractor_id: string | null
  contractor_name: string | null
  sla_due: number | null
  needs_confirmation: 'resident' | 'concierge' | null
  reasoning: string[]
  history: { ts: number; status: TicketStatus; actor: string; note: string }[]
}

export type Contractor = {
  id: string
  name: string
  category: string
  phone: string
  sla_minutes: number
  hours: string
  channel: string
  call_out_price: number
}

export type Dictionaries = { categories: Record<string, string>; statuses: Record<string, string> }


export type RunAction = {
  type: 'set_signal' | 'notify' | 'dispatch' | (string & {})
  status: 'ok' | 'error' | 'conflict' | (string & {})
  device_id?: string
  signal?: string
  value?: unknown
  target?: string
  message?: string
  detail?: string
  attempts?: number
}

export type RunRecord = {
  ts: number
  status: string
  reason?: string
  actions: RunAction[]
}

export type SimulateReport = {
  rule_id: string
  passed: boolean
  verdict: string
  sim_time: string | null
  runs: RunRecord[]
  notifications: Notification[]
  lint: Lint
}

/** 422 от pydantic приходит списком {msg, loc}: сводим к читаемой строке. */
function readableDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => String((item as { msg?: string }).msg ?? JSON.stringify(item)).replace(/^Value error, /, ''))
      .join('; ')
  }
  return JSON.stringify(detail)
}

/** Запрос, который завис на прокси, не должен держать экран пустым бесконечно. */
const REQUEST_TIMEOUT_MS = 10_000
/** HTML-страница ошибки прокси (502) целиком в тосте не нужна. */
const DETAIL_MAX = 240

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
    })
  } catch (e) {
    const name = (e as Error).name
    if (name === 'TimeoutError') throw new Error('Сервер не ответил за 10 секунд')
    if (name === 'AbortError') throw e
    throw new Error('Нет связи с сервером')
  }
  if (!res.ok) {
    let detail: unknown = await res.text()
    try {
      detail = JSON.parse(detail as string).detail ?? detail
    } catch {
      /* текст как есть */
    }
    let text = readableDetail(detail)
    if (/^\s*</.test(text)) text = `Ошибка сервера ${res.status}`
    throw new Error(text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}…` : text)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const body = (data: unknown) => ({ body: JSON.stringify(data) })
const enc = encodeURIComponent

export type Role = 'resident' | 'uk'

export type LintIssue = { level: 'error' | 'warning' | 'info'; code: string; message: string }
export type Lint = { ok: boolean; errors?: number; warnings?: number; issues: LintIssue[] }

export type Compiled = {
  intent: { intent: 'rule' | 'command' | 'question'; confidence?: number }
  text?: string
  rule: Rule | null
  explanation?: string
  lint?: Lint
  answer?: string
  error?: string
}

export type CheckLine = { kind: 'ok' | 'warn' | 'fail'; text: string }
export type Confirmed = {
  kind: 'rule' | 'command'
  explanation: string
  rule?: Rule
  lint?: Lint
  run?: RunRecord
  check?: { passed: boolean; lines: CheckLine[] } | null // прогон на копии дома при «Да»
}

export type Policy = { auto_send_building: boolean; auto_categories: string[]; daily_limit: number }

export type GherkinStep = { keyword: string; text: string; line: number; status: 'passed' | 'failed' | 'undefined' | 'skipped'; detail: string }
export type GherkinReport = {
  feature: string
  passed: boolean
  summary: string
  text: string
  scenarios: { name: string; passed: boolean; steps: GherkinStep[] }[]
}

export const api = {
  families: () => json<Family[]>('/api/families'),
  devices: () => json<Device[]>('/api/devices'),
  createDevice: (d: { family: string; title?: string; room?: string; scope?: string }) =>
    json<Device>('/api/devices', { method: 'POST', ...body(d) }),
  patchDevice: (id: string, patch: Partial<Pick<Device, 'title' | 'room' | 'scope' | 'online'>>) =>
    json<Device>(`/api/devices/${enc(id)}`, { method: 'PATCH', ...body(patch) }),
  deleteDevice: (id: string) => json<void>(`/api/devices/${enc(id)}`, { method: 'DELETE' }),

  createType: (spec: DeviceTypeSpec) => json<Family>('/api/device-types', { method: 'POST', ...body(spec) }),
  updateType: (spec: DeviceTypeSpec) =>
    json<Family>(`/api/device-types/${enc(spec.family)}`, { method: 'PUT', ...body(spec) }),
  deleteType: (family: string) => json<void>(`/api/device-types/${enc(family)}`, { method: 'DELETE' }),
  command: (id: string, signal: string, value: unknown) =>
    json(`/api/devices/${enc(id)}/command`, { method: 'POST', ...body({ signal, value }) }),
  inject: (id: string, input: string, value: unknown) =>
    json(`/api/devices/${enc(id)}/inject`, { method: 'POST', ...body({ input, value }) }),

  rules: () => json<Rule[]>('/api/rules'),
  createRule: (r: Rule) => json<Rule>('/api/rules', { method: 'POST', ...body(r) }),
  updateRule: (r: Rule) => json<Rule>(`/api/rules/${enc(r.id)}`, { method: 'PUT', ...body(r) }),
  deleteRule: (id: string) => json(`/api/rules/${enc(id)}`, { method: 'DELETE' }),
  runRule: (id: string) => json(`/api/rules/${enc(id)}/run`, { method: 'POST' }),

  compile: (text: string, role: Role, previous?: string) =>
    json<Compiled>('/api/nl/compile', { method: 'POST', ...body({ text, role, previous }) }),
  confirm: (rule: Rule, role: Role) => json<Confirmed>('/api/nl/confirm', { method: 'POST', ...body({ rule, role }) }),

  notifications: (target?: string) =>
    json<Notification[]>(`/api/notifications?limit=100${target ? `&target=${enc(target)}` : ''}`),
  events: (limit = 100) => json<BusEvent[]>(`/api/events?limit=${limit}`),

  incidents: (role: Role, limit = 50) => json<Incident[]>(`/api/incidents?limit=${limit}&role=${role}`),
  tickets: (role: Role) => json<Ticket[]>(`/api/tickets?role=${role}`),
  createTicket: (draft: TicketDraft) => json<Ticket>('/api/tickets', { method: 'POST', ...body(draft) }),
  moveTicket: (id: string, status: TicketStatus, actor: string, note = '') =>
    json<Ticket>(`/api/tickets/${enc(id)}/transition`, { method: 'POST', ...body({ status, actor, note }) }),
  contractors: () => json<Contractor[]>('/api/contractors'),
  dictionaries: () => json<Dictionaries>('/api/dictionaries'),

  simulate: (rule: Rule, ticks = 15) =>
    json<SimulateReport>('/api/simulate', { method: 'POST', ...body({ rule, ticks }) }),
  policy: () => json<Policy>('/api/policy'),
  setPolicy: (policy: Policy) => json<Policy>('/api/policy', { method: 'PUT', ...body(policy) }),
  explainRule: (id: string) => json<{ text: string }>(`/api/rules/${enc(id)}/explain`),
  gherkin: (rule: Rule) => json<GherkinReport>('/api/gherkin/run', { method: 'POST', ...body({ rule }) }),
}

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 15_000

/**
 * Шина событий по WebSocket с переподключением и экспоненциальной паузой.
 * onReopen вызывается при каждом переподключении, кроме первого: данные за время обрыва надо подтянуть заново.
 */
export function openEvents(onEvent: (e: BusEvent) => void, onReopen?: () => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let opened = false
  let delay = RECONNECT_MIN_MS
  const connect = () => {
    if (closed) return
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => {
      delay = RECONNECT_MIN_MS
      if (opened) onReopen?.()
      opened = true
    }
    ws.onmessage = (m) => {
      let event: unknown
      try {
        event = JSON.parse(m.data)
      } catch {
        return // битый кадр пропускаем
      }
      if (event && typeof event === 'object' && 'kind' in event) onEvent(event as BusEvent)
    }
    ws.onclose = () => {
      if (closed) return
      timer = setTimeout(connect, delay)
      delay = Math.min(delay * 2, RECONNECT_MAX_MS)
    }
  }
  connect()
  return () => {
    closed = true
    clearTimeout(timer)
    ws?.close()
  }
}
