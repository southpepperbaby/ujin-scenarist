import type { IconName } from '../../shared/ui/Icon'

const BY_FAMILY: Record<string, IconName> = {
  leak: 'droplet',
  valve: 'valve',
  counter: 'gauge',
  thermostat: 'thermometer',
  light: 'bulb',
  window: 'window',
  fire: 'flame',
  barrier: 'barrier',
  elevator: 'elevator',
  ventilation: 'fan',
}

/** Имя сигнала, которое показывается на плитке устройства крупным значением. */
const PRIMARY_SIGNAL: Record<string, string> = {
  leak: 'leak',
  valve: 'state',
  counter: 'total',
  thermostat: 'temperature',
  light: 'lamp',
  window: 'open',
  fire: 'smoke',
  barrier: 'state',
  elevator: 'floor_current',
  ventilation: 'co2',
}

export function deviceIcon(family: string): IconName {
  return BY_FAMILY[family] ?? 'grid'
}

export function primarySignalName(family: string): string | null {
  return PRIMARY_SIGNAL[family] ?? null
}
