import type { BusEvent, Device } from '../api'

/** Сигналы неисправностей: их смену показываем, даже если устройство меняет их само. */
const ALARM_SIGNALS = new Set(['leak', 'alarm', 'fault', 'emergency', 'jammed', 'tamper', 'smoke'])

/**
 * Важное: команды, воздействия из песочницы, аварии, правила, уведомления, инциденты, заявки.
 * Шум: всё, что устройство меняет само по своей физике. Это и телеметрия (CO2, расход, батарея), и
 * режимы вроде «нагрев / охлаждение» у термостата, которые переключаются каждые несколько секунд.
 */
export function important(event: BusEvent, devices: Device[]): boolean {
  if (event.kind === 'log' || event.kind === 'ujin') return false
  if (event.kind === 'rule') return event.phase !== 'running'
  if (event.kind !== 'signal') return true
  if (event.source && event.source !== 'tick') return true // команда, воздействие, ручное значение
  if (ALARM_SIGNALS.has(event.signal ?? '')) return true
  // У своих типов неисправность задана значением alarm_value: смена, после которой устройство в аварии.
  const device = devices.find((item) => item.id === event.device_id)
  return Boolean(device?.alarms?.length && device.signals.find((s) => s.name === event.signal)?.layout)
}
