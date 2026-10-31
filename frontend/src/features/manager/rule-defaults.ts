import type { Action, Condition, Device, Rule, SignalDecl } from '../../api'

type SigLike = { layout?: Record<string, string>; value: unknown }

/** Значение по умолчанию для нового условия: последний пункт списка или текущее показание. */
export function firstValue(sig?: SigLike): unknown {
  if (sig?.layout) return Number(Object.keys(sig.layout).at(-1))
  return sig?.value ?? 1
}

/** Сигналы, на которые правило может опираться: без служебных, для команд — только записываемые. */
export function usableSignals(device: Device | undefined, writableOnly = false): SignalDecl[] {
  return (device?.signals ?? []).filter((s) => s.kind !== 'system' && (!writableOnly || s.management !== 'r'))
}

/** Правила УК живут на уровне дома: квартирные устройства жителя в них не участвуют. */
export function ruleDevices(devices: Device[]): Device[] {
  return devices.filter((device) => device.scope === 'building')
}

export function newRule(devices: Device[]): Rule {
  const first = ruleDevices(devices)[0]
  const signal = usableSignals(first)[0]
  return {
    id: 'r-' + crypto.randomUUID().slice(0, 8),
    title: 'Новое правило',
    description: '',
    scope: 'building',
    owner: 'uk',
    priority: 100,
    enabled: false,
    status: 'draft',
    cooldown_s: 3,
    trigger: { type: 'signal', device_id: first?.id ?? '', signal: signal?.name ?? '', op: 'eq', value: firstValue(signal) },
    conditions: [],
    actions: [{ type: 'notify', target: 'concierge', level: 'warning', message: 'Сработало правило' }],
  }
}

export function newSignalCondition(devices: Device[]): Condition {
  const device = ruleDevices(devices)[0]
  const sig = usableSignals(device)[0]
  return { type: 'signal', device_id: device?.id ?? '', signal: sig?.name ?? '', op: 'eq', value: firstValue(sig) }
}

export function defaultSet(devices: Device[]): Action {
  const pool = ruleDevices(devices)
  const device = pool.find((d) => usableSignals(d, true).length > 0) ?? pool[0]
  const sig = usableSignals(device, true)[0]
  return { type: 'set_signal', device_id: device?.id ?? '', signal: sig?.name ?? '', value: firstValue(sig) }
}

/** Заменить элемент списка по индексу, не мутируя исходный. */
export function updateAt<T>(list: T[], index: number, next: T): T[] {
  return list.map((item, j) => (j === index ? next : item))
}

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, j) => j !== index)
}

const filled = (v: unknown) => v !== '' && v !== undefined && v !== null

/** Проверка до отправки: пустые устройство и сигнал вернулись бы 422 без понятного текста. */
export function validateRule(rule: Rule): string | null {
  if (!rule.title.trim()) return 'Назовите правило'
  if (!rule.trigger.device_id || !rule.trigger.signal) return '«Когда»: выберите устройство и сигнал'
  if (rule.trigger.op !== 'changed' && !filled(rule.trigger.value)) return '«Когда»: укажите значение'
  for (const [index, c] of rule.conditions.entries()) {
    if (c.type === 'time') {
      if (!c.start || !c.end) return `Условие ${index + 1}: укажите начало и конец интервала`
      continue
    }
    if (!c.device_id || !c.signal) return `Условие ${index + 1}: выберите устройство и сигнал`
    if (c.op !== 'changed' && !filled(c.value)) return `Условие ${index + 1}: укажите значение`
  }
  if (rule.actions.length === 0) return 'Добавьте хотя бы одно действие'
  for (const [index, a] of rule.actions.entries()) {
    if (a.type === 'set_signal' && (!a.device_id || !a.signal)) return `Действие ${index + 1}: выберите устройство и команду`
    if (a.type === 'set_signal' && !filled(a.value)) return `Действие ${index + 1}: укажите значение`
    if (a.type === 'notify' && !a.message.trim()) return `Действие ${index + 1}: напишите текст уведомления`
    if ((a.delay_s ?? 0) < 0) return `Действие ${index + 1}: задержка не может быть отрицательной`
  }
  if (!Number.isFinite(rule.priority)) return 'Приоритет должен быть числом'
  return null
}
