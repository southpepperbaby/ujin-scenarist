import type { Device, Op, Rule } from './api'
import { deviceById, signalTitle, valueLabel } from './store'

export const OP_TITLE: Record<Op, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  changed: 'изменился',
}

/** Правило одной строкой «когда» и списком действий: для карточек правил. */
export function describeRule(r: Rule, devices: Device[]) {
  const t = r.trigger
  const dev = deviceById(devices, t.device_id)
  const when = `${dev?.title ?? t.device_id}: ${signalTitle(devices, t.device_id, t.signal)} ${
    t.op === 'changed' ? 'изменился' : `${OP_TITLE[t.op]} ${valueLabel(devices, t.device_id, t.signal, t.value)}`
  }`
  const acts = r.actions.map((a) => {
    if (a.type === 'set_signal')
      return `${deviceById(devices, a.device_id)?.title ?? a.device_id} → ${signalTitle(devices, a.device_id, a.signal)}: ${valueLabel(devices, a.device_id, a.signal, a.value)}`
    if (a.type === 'notify') return a.target === 'concierge' ? 'сигнал консьержу' : 'уведомление жителю'
    return 'заявка подрядчику'
  })
  return { when, acts }
}
