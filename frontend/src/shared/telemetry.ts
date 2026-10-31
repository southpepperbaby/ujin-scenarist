import type { BusEvent, Device } from '../api'

/** Непрерывные величины: эмулятор пересчитывает их каждый тик, это фон, а не событие. */
const TELEMETRY_CONTROLS = ['graph', 'counter']

/**
 * Дребезг: сигнал, который сам меняется на тике чаще FLAP_LIMIT раз за FLAP_WINDOW_S
 * (термостат щёлкает нагрев/охлаждение, вентиляция в авто качает скорость 0 ↔ 1).
 * Цикл шлагбаума даёт максимум три тиковых перехода — он под порог не попадает.
 */
const FLAP_WINDOW_S = 20
const FLAP_LIMIT = 4

const recentTicks = new Map<string, number[]>()

/** Перед разбором загруженной истории: иначе события, уже учтённые с шины, посчитаются дважды. */
export function resetTelemetry(): void {
  recentTicks.clear()
}

function isFlapping(event: BusEvent): boolean {
  const key = `${event.device_id}.${event.signal}`
  const since = event.ts - FLAP_WINDOW_S
  const ticks = (recentTicks.get(key) ?? []).filter((ts) => ts > since)
  ticks.push(event.ts)
  recentTicks.set(key, ticks)
  return ticks.length >= FLAP_LIMIT
}

/**
 * Фоновое тиковое изменение датчика, а не действие или переход состояния.
 * Вызывать ровно один раз на событие и по порядку шины: учёт дребезга копит историю.
 */
export function isTelemetry(event: BusEvent, devices: Device[]): boolean {
  if (event.kind !== 'signal' || event.source !== 'tick') return false
  const flapping = isFlapping(event)
  const signal = devices.find((d) => d.id === event.device_id)?.signals.find((s) => s.name === event.signal)
  return flapping || (signal ? TELEMETRY_CONTROLS.includes(signal.control) : false)
}
