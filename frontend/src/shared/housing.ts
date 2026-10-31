import type { Device } from '../api'

/**
 * Жилые комплексы и квартиры, которые обслуживает УК. Бэкенд пока знает один дом:
 * квартирные устройства относятся к кв. 2806, остальное — общедомовое.
 */
export type Complex = { id: string; title: string; flats: string[] }

export const COMPLEXES: [Complex, ...Complex[]] = [{ id: 'severny-1', title: 'ЖК «Северный», корп. 1', flats: ['2806'] }]

/** Выбор квартиры: все устройства дома, одна квартира или только общедомовое. */
export type FlatChoice = 'all' | 'building' | `flat:${string}`

export function flatOptions(complex: Complex): { value: FlatChoice; label: string; hint?: string }[] {
  return [
    { value: 'all', label: 'Все квартиры', hint: 'Квартирное и общедомовое оборудование' },
    ...complex.flats.map((flat) => ({ value: `flat:${flat}` as FlatChoice, label: `Квартира ${flat}` })),
    { value: 'building', label: 'Общедомовое', hint: 'Шлагбаум, лифт и другое оборудование дома' },
  ]
}

export function devicesFor(devices: Device[], choice: FlatChoice): Device[] {
  if (choice === 'all') return devices
  if (choice === 'building') return devices.filter((device) => device.scope === 'building')
  return devices.filter((device) => device.scope === 'apartment')
}
