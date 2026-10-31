import { useState } from 'react'

import type { BusEvent, Device } from '../../api'
import { COMPLEXES, devicesFor, flatOptions, type FlatChoice } from '../../shared/housing'
import { Dropdown } from '../../shared/ui/Dropdown'
import { DeviceCard } from './DeviceCard'
import { EventFeed } from './EventFeed'

type SandboxPageProps = {
  devices: Device[]
  events: BusEvent[]
  telemetry: BusEvent[]
}

/** Песочница эмуляторов встроена в кабинет УК: прогон правил и ручные воздействия. */
export function SandboxPage({ devices, events, telemetry }: SandboxPageProps) {
  const [complexId, setComplexId] = useState(COMPLEXES[0].id)
  const [flat, setFlat] = useState<FlatChoice>('all')
  const complex = COMPLEXES.find((item) => item.id === complexId) ?? COMPLEXES[0]
  const visible = devicesFor(devices, flat)

  return (
    // Раскладка считается от ширины самой страницы (@container), а не окна: сайдбар её съедает.
    // Узко — лента уходит под устройства; широко — справа. Строки не растут по содержимому,
    // поэтому обе части листаются сами.
    <div className="@container h-full">
      <div className="grid h-full grid-rows-[minmax(0,1fr)_280px] @4xl:grid-cols-[minmax(0,1fr)_340px] @4xl:grid-rows-[minmax(0,1fr)] @6xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="@container scroll-slim min-h-0 overflow-y-auto px-7 py-6">
          <div className="mb-5 grid gap-4 @xl:grid-cols-2">
            <Dropdown
              label="ЖИЛОЙ КОМПЛЕКС"
              icon="building"
              value={complexId}
              options={COMPLEXES.map((item) => ({ value: item.id, label: item.title }))}
              onChange={(next) => {
                setComplexId(next)
                setFlat('all')
              }}
            />
            <Dropdown label="КВАРТИРА" icon="home" value={flat} options={flatOptions(complex)} onChange={setFlat} />
          </div>
          <div className="grid gap-4 @2xl:grid-cols-2 @6xl:grid-cols-3">
            {visible.map((device) => (
              <DeviceCard key={device.id} device={device} controls />
            ))}
          </div>
        </div>
        <aside className="flex min-h-0 flex-col border-t border-line bg-surface @4xl:border-t-0 @4xl:border-l">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Лента событий</h2>
          <div className="min-h-0 flex-1">
            <EventFeed events={events} telemetry={telemetry} devices={devices} />
          </div>
        </aside>
      </div>
    </div>
  )
}
