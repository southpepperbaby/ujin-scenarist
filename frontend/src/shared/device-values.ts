import type { Device, SignalDecl } from '../api'

/** Короткие помощники для плиток устройств: ключевой сигнал, значение с единицей, признак аварии. */

const KEY_SIGNAL: Record<string, string> = {
  leak: 'leak',
  valve: 'state',
  counter: 'total',
  light: 'lamp',
  thermostat: 'temperature',
  fire: 'alarm',
  barrier: 'state',
  elevator: 'floor_current',
  ventilation: 'co2',
}

export function showValue(s: Pick<SignalDecl, 'value' | 'layout' | 'measure'>) {
  if (s.layout?.[String(s.value)]) return s.layout[String(s.value)]
  const v = typeof s.value === 'number' ? +s.value.toFixed(2) : s.value
  return `${v}${s.measure ? ' ' + s.measure : ''}`
}

export function keySignal(d: Device) {
  const sig = d.signals.find((s) => s.name === KEY_SIGNAL[d.family]) ?? d.signals.find((s) => s.group === 'property')
  if (!sig) return ''
  return `${sig.title}: ${showValue(sig)}`
}

export function isAlarm(d: Device) {
  const get = (n: string) => d.signals.find((s) => s.name === n)?.value
  return (d.family === 'leak' && get('leak') === 1) || (d.family === 'fire' && get('alarm') === 1) || (d.family === 'valve' && get('jammed') === 1)
}
