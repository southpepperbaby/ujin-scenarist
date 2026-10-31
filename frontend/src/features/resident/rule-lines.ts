import type { Device, Rule } from '../../api'
import { deviceById, signalTitle, valueLabel } from '../../store'

const OP_TITLE: Record<string, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  changed: 'изменился',
}

const TIME_HINT = 'условие по времени'

function deviceName(devices: Device[], id: string): string {
  return deviceById(devices, id)?.title ?? id
}

/** Правило в трёх блоках — так же, как его хранит движок исполнения. */
export function ruleLines(rule: Rule, devices: Device[]) {
  const trigger = rule.trigger
  const when = [
    trigger.op === 'changed'
      ? `${deviceName(devices, trigger.device_id)} · ${signalTitle(devices, trigger.device_id, trigger.signal)} изменился`
      : `${deviceName(devices, trigger.device_id)} · ${signalTitle(devices, trigger.device_id, trigger.signal)} ${
          OP_TITLE[trigger.op]
        } ${valueLabel(devices, trigger.device_id, trigger.signal, trigger.value)}`,
  ]

  const conditions = rule.conditions.map((condition) => {
    if (!condition.device_id) return TIME_HINT
    return `${deviceName(devices, condition.device_id)} · ${signalTitle(devices, condition.device_id, condition.signal)} ${
      OP_TITLE[condition.op] ?? condition.op
    } ${valueLabel(devices, condition.device_id, condition.signal, condition.value)}`
  })

  const actions = rule.actions.map((action) => {
    if (action.type === 'set_signal') {
      return `${deviceName(devices, action.device_id)} → ${signalTitle(devices, action.device_id, action.signal)}: ${valueLabel(
        devices,
        action.device_id,
        action.signal,
        action.value,
      )}`
    }
    if (action.type === 'notify') {
      return action.target === 'concierge'
        ? `Сигнал консьержу: «${action.message}»`
        : `Уведомление жителю: «${action.message}»`
    }
    return `Заявка подрядчику${action.note ? `: ${action.note}` : ''}`
  })

  return { when, conditions, actions }
}
