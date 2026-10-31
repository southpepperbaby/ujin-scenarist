import type { Contractor, Device, Incident, Notification, Rule, Ticket } from '../api'

const now = Date.now() / 1000

const signal = (
  name: string,
  title: string,
  value: number | string,
  extra: Partial<Device['signals'][number]> = {},
): Device['signals'][number] => ({
  name,
  title,
  control: 'list',
  management: 'r',
  kind: 'int',
  group: 'property',
  value,
  ...extra,
})

/**
 * Запасные данные на случай, когда бэкенд не отвечает: интерфейс остаётся
 * показательным для демо и жюри, но честно помечает себя как демо-режим.
 */
export const FALLBACK_DEVICES: Device[] = [
  {
    id: 'leak-1', family: 'leak', title: 'Датчик протечки', model: 'emul_leak_sensor', room: 'Кухня',
    scope: 'apartment', ujin: { sn: '17399301610001807', ext: '1' }, online: true, inputs: ['wet'], events: [],
    signals: [
      signal('leak', 'Протечка', 1, { layout: { '0': 'сухо', '1': 'протечка' } }),
      signal('battery', 'Батарея', 18, { measure: '%', control: 'counter' }),
    ],
  },
  {
    id: 'valve-2', family: 'valve', title: 'Клапан холодной воды', model: 'emul_valve', room: 'Кухня',
    scope: 'apartment', ujin: null, online: true, inputs: [], events: [],
    signals: [
      signal('state', 'Состояние', 0, { layout: { '0': 'перекрыт', '1': 'открыт' } }),
      signal('valve', 'Клапан', 0, {
        management: 'rw', group: 'capability', control: 'switch',
        layout: { '0': 'перекрыть', '1': 'открыть' },
      }),
    ],
  },
  {
    id: 'thermostat-3', family: 'thermostat', title: 'Термостат', model: 'emul_thermostat', room: 'Спальня',
    scope: 'apartment', ujin: null, online: true, inputs: ['fault'], events: [],
    signals: [
      signal('temperature', 'Температура', 21.4, { measure: '°C', control: 'graph', kind: 'float' }),
      signal('humidity', 'Влажность', 45, { measure: '%', control: 'graph' }),
      signal('mode', 'Режим', 0, {
        management: 'rw', group: 'capability',
        layout: { '0': 'выкл', '1': 'нагрев', '2': 'охлаждение', '3': 'авто' },
      }),
    ],
  },
  {
    id: 'light-4', family: 'light', title: 'Свет в коридоре', model: 'emul_light', room: 'Коридор',
    scope: 'apartment', ujin: null, online: true, inputs: [], events: [],
    signals: [
      signal('lamp', 'Свет', 1, {
        management: 'rw', group: 'capability', control: 'switch', layout: { '0': 'выкл', '1': 'вкл' },
      }),
      signal('power_w', 'Мощность', 12, { measure: 'Вт', control: 'graph', kind: 'float' }),
    ],
  },
  {
    id: 'window-5', family: 'window', title: 'Датчик окна', model: 'emul_window', room: 'Спальня',
    scope: 'apartment', ujin: null, online: true, inputs: ['open'], events: [],
    signals: [
      signal('open', 'Окно', 1, { layout: { '0': 'закрыто', '1': 'открыто' } }),
      signal('battery', 'Батарея', 76, { measure: '%', control: 'counter' }),
    ],
  },
  {
    id: 'elevator-6', family: 'elevator', title: 'Лифт', model: 'emul_elevator', room: 'Подъезд 1',
    scope: 'building', ujin: null, online: true, inputs: [], events: [],
    signals: [
      signal('floor_current', 'Текущий этаж', 4, { control: 'counter' }),
      signal('emergency', 'Авария', 1, { layout: { '0': 'норма', '1': 'авария' } }),
    ],
  },
  {
    id: 'barrier-7', family: 'barrier', title: 'Шлагбаум', model: 'emul_barrier', room: 'Двор',
    scope: 'building', ujin: null, online: false, inputs: ['obstacle'], events: [],
    signals: [
      signal('state', 'Состояние стрелы', 0, { layout: { '0': 'закрыто', '2': 'открыто' } }),
      signal('alarm', 'Авария', 0, { layout: { '0': 'нет', '1': 'застревание' } }),
    ],
  },
]

export const FALLBACK_RULES: Rule[] = [
  {
    id: 'night-leak', title: 'Ночная протечка', scope: 'apartment', owner: 'resident', priority: 10,
    enabled: true, status: 'active', cooldown_s: 300,
    description: 'Если ночью кухонный датчик намокнет — перекрыть воду, включить свет и позвать УК.',
    trigger: { type: 'signal', device_id: 'leak-1', signal: 'leak', op: 'eq', value: 1 },
    conditions: [{ device_id: 'valve-2', signal: 'state', op: 'eq', value: 1 }],
    actions: [
      { type: 'set_signal', device_id: 'valve-2', signal: 'valve', value: 0 },
      { type: 'set_signal', device_id: 'light-4', signal: 'lamp', value: 1 },
      { type: 'notify', target: 'resident', message: 'Протечка на кухне, вода перекрыта', level: 'critical' },
      { type: 'dispatch', category: 'plumbing', note: 'Протечка на кухне' },
    ],
  },
  {
    id: 'window-heating', title: 'Открыто окно — выключить отопление', scope: 'apartment', owner: 'resident',
    priority: 5, enabled: true, status: 'active', cooldown_s: 120,
    description: 'Когда в спальне открывают окно, выключаю отопление и напоминаю закрыть.',
    trigger: { type: 'signal', device_id: 'window-5', signal: 'open', op: 'eq', value: 1 },
    conditions: [{ device_id: 'thermostat-3', signal: 'mode', op: 'ne', value: 0 }],
    actions: [
      { type: 'set_signal', device_id: 'thermostat-3', signal: 'mode', value: 0 },
      { type: 'notify', target: 'resident', message: 'Открыто окно в спальне, отопление выключено', level: 'warning' },
    ],
  },
  {
    id: 'leaving-home', title: 'Ухожу из дома', scope: 'apartment', owner: 'resident', priority: 1,
    enabled: false, status: 'checked', cooldown_s: 0,
    description: 'По кнопке «Ухожу» гашу свет и опускаю температуру.',
    trigger: { type: 'signal', device_id: 'light-4', signal: 'lamp', op: 'changed', value: null },
    conditions: [],
    actions: [{ type: 'set_signal', device_id: 'light-4', signal: 'lamp', value: 0 }],
  },
]

export const FALLBACK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n-1', ts: now - 300, target: 'resident', level: 'critical', rule_id: 'night-leak',
    rule_title: 'Ночная протечка',
    message: 'Протечка на кухне. Вода перекрыта, заявка T-1043 ушла в «АкваСервис».',
  },
  {
    id: 'n-2', ts: now - 1200, target: 'resident', level: 'warning', rule_id: 'window-heating',
    rule_title: 'Открыто окно — выключить отопление',
    message: 'Открыто окно в спальне, на улице −4 °C. Отопление выключено.',
  },
  {
    id: 'n-3', ts: now - 5400, target: 'concierge', level: 'critical', rule_id: 'night-leak',
    rule_title: 'Ночная протечка',
    message: 'Кв. 2806: протечка на кухне, смягчение выполнено, заявка создана.',
  },
  {
    id: 'n-4', ts: now - 7200, target: 'resident', level: 'info', rule_id: null, rule_title: null,
    message: 'Батарея датчика протечки 18%. Замените до конца недели.',
  },
]

export const FALLBACK_INCIDENTS: Incident[] = [
  {
    id: 'I-A41C9D', ts: now - 300, device_id: 'leak-1', device_title: 'Датчик протечки', room: 'Кухня',
    scope: 'apartment', signal: 'leak', title: 'Протечка воды', status: 'dispatched', decision: 'auto',
    ticket_id: 'T-1043', rule_id: 'night-leak',
    reasoning: [
      'Сигнал держится 12 с, это не дребезг.',
      'Заявку запросило правило «Ночная протечка».',
      'Уверенность 94% выше порога 85%: заявка уходит сама.',
    ],
    verdict: {
      source: 'jev', category: 'plumbing', level: 3, confidence: 0.94, damage: 0.92, people: 0.08,
      false_alarm: 0.04,
      reasons: ['Jev: подрядчик «Сантехника и водоснабжение», уровень «критично», риск ущерба 92%.'],
    },
  },
  {
    id: 'I-77B130', ts: now - 5400, device_id: 'elevator-6', device_title: 'Лифт', room: 'Подъезд 1',
    scope: 'building', signal: 'emergency', title: 'Лифт остановлен аварийно', status: 'dispatched',
    decision: 'auto', ticket_id: 'T-1042', rule_id: null,
    reasoning: ['Кабина пуста, людей внутри нет.', 'Уверенность 88%: заявка уходит сама.'],
    verdict: {
      source: 'jev', category: 'lift', level: 2, confidence: 0.88, damage: 0.41, people: 0.12,
      false_alarm: 0.05, reasons: ['Jev: подрядчик «Лифтовое хозяйство», уровень «мажор».'],
    },
  },
  {
    id: 'I-2E9044', ts: now - 9000, device_id: 'barrier-7', device_title: 'Шлагбаум', room: 'Двор',
    scope: 'building', signal: 'online', title: 'Шлагбаум не на связи', status: 'logged', decision: 'ask',
    ticket_id: null, rule_id: null,
    reasoning: ['Уверенность 72% между порогами: решение за диспетчером.'],
    verdict: {
      source: 'jev', category: 'access', level: 1, confidence: 0.72, damage: 0.1, people: 0.02,
      false_alarm: 0.3, reasons: ['Jev: подрядчик «Ворота, шлагбаум, СКУД», уровень «минор».'],
    },
  },
]

export const FALLBACK_TICKETS: Ticket[] = [
  {
    id: 'T-1043', created: now - 290, status: 'in_progress', category: 'plumbing', level: 3,
    title: 'Протечка воды на кухне', description: 'Клапан перекрыт автоматически, нужен осмотр стояка.',
    address: 'ЖК «Северный», корп. 1, кв. 2806', device_id: 'leak-1', incident_id: 'I-A41C9D',
    rule_id: 'night-leak', contractor_id: 'aquaservice', contractor_name: 'ООО «АкваСервис»',
    sla_due: now + 900, needs_confirmation: null,
    reasoning: ['Критично: отправили сразу, без подтверждения человеком.'],
    history: [{ ts: now - 290, status: 'new', actor: 'автодиспетчер', note: '' }],
  },
  {
    id: 'T-1042', created: now - 5300, status: 'accepted', category: 'lift', level: 2,
    title: 'Лифт остановлен аварийно', description: 'Подъезд 1, кабина пуста.',
    address: 'ЖК «Северный», корп. 1', device_id: 'elevator-6', incident_id: 'I-77B130', rule_id: null,
    contractor_id: 'liftmontazh', contractor_name: 'АО «ЛифтМонтаж»', sla_due: now - 1200,
    needs_confirmation: null, reasoning: ['Мажор: у диспетчера есть 10 минут на отмену.'],
    history: [{ ts: now - 5300, status: 'new', actor: 'автодиспетчер', note: '' }],
  },
  {
    id: 'T-1041', created: now - 9000, status: 'draft', category: 'access', level: 1,
    title: 'Шлагбаум не на связи', description: 'Проверить питание и модуль связи.',
    address: 'ЖК «Северный», двор', device_id: 'barrier-7', incident_id: 'I-2E9044', rule_id: null,
    contractor_id: 'vorota', contractor_name: '«Ворота Профи»', sla_due: now + 2400,
    needs_confirmation: 'concierge', reasoning: ['Минор: заявка готова, отправит УК одной кнопкой.'],
    history: [],
  },
]

export const FALLBACK_CONTRACTORS: Contractor[] = [
  { id: 'aquaservice', name: 'ООО «АкваСервис»', category: 'plumbing', phone: '+7 900 100-10-10', sla_minutes: 30, hours: '24/7', channel: 'webhook', call_out_price: 1500 },
  { id: 'volt', name: 'ИП Волков, электромонтаж', category: 'electric', phone: '+7 900 200-20-20', sla_minutes: 120, hours: '09-21', channel: 'webhook', call_out_price: 1200 },
  { id: 'vorota', name: '«Ворота Профи»', category: 'access', phone: '+7 900 300-30-30', sla_minutes: 60, hours: '24/7', channel: 'webhook', call_out_price: 2000 },
  { id: 'liftmontazh', name: 'АО «ЛифтМонтаж»', category: 'lift', phone: '+7 900 400-40-40', sla_minutes: 30, hours: '24/7', channel: 'webhook', call_out_price: 0 },
]

export const CATEGORY_TITLES: Record<string, string> = {
  plumbing: 'Сантехника и водоснабжение',
  electric: 'Электрика и освещение',
  access: 'Ворота, шлагбаум, СКУД',
  lift: 'Лифтовое хозяйство',
  fire: 'Пожарная безопасность',
  heating: 'Отопление и вентиляция',
  general: 'Общие работы',
}
