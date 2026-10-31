import type { Device, RunAction } from '../../api'
import { deviceById, signalTitle, valueLabel } from '../../store'

/** Шаг движка словами: бэкенд отдаёт сырой тип действия, готового текста там нет. */
export function describeAction(action: RunAction, devices: Device[]): string {
  if (action.type === 'set_signal' && action.device_id && action.signal) {
    const device = deviceById(devices, action.device_id)?.title ?? action.device_id
    const name = signalTitle(devices, action.device_id, action.signal)
    const value = valueLabel(devices, action.device_id, action.signal, action.value)
    return `${device} → ${name}: ${value}`
  }
  if (action.type === 'notify') {
    const who = action.target === 'concierge' ? 'консьержу' : 'жителю'
    return `Уведомление ${who}: ${action.message ?? ''}`.trim()
  }
  if (action.type === 'dispatch') return `Заявка подрядчику${action.detail ? `: ${action.detail}` : ''}`
  return action.detail ?? action.type
}

export const ACTION_STATUS_ICON: Record<string, 'check' | 'close' | 'alert'> = {
  ok: 'check',
  error: 'close',
  conflict: 'alert',
}

export const ACTION_STATUS_COLOR: Record<string, string> = {
  ok: 'text-ok',
  error: 'text-sev-crit',
  conflict: 'text-sev-minor',
}
