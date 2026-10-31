import type { BusEvent, Device } from '../api'

/**
 * Телеметрия: числовые показания, которые устройства меняют сами каждую секунду (CO2, расход, батарея).
 * Важное: команды, смена дискретного состояния (протечка, клапан, стрела), правила, уведомления, заявки.
 */
export function important(event: BusEvent, devices: Device[]): boolean {
  if (event.kind === 'log' || event.kind === 'ujin') return false
  if (event.kind === 'rule') return event.phase !== 'running'
  if (event.kind !== 'signal') return true
  if (event.source === 'command') return true
  const device = devices.find((item) => item.id === event.device_id)
  const signal = device?.signals.find((item) => item.name === event.signal)
  return Boolean(signal?.layout)
}
