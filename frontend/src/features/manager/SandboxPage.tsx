import type { BusEvent, Device } from '../../api'
import { DeviceCard } from './DeviceCard'
import { EventFeed } from './EventFeed'

type SandboxPageProps = {
  devices: Device[]
  events: BusEvent[]
  telemetry: BusEvent[]
}

/** Песочница эмуляторов встроена в кабинет УК: прогон правил и ручные воздействия. */
export function SandboxPage({ devices, events, telemetry }: SandboxPageProps) {
  return (
    // Строка грида не растёт по содержимому: обе колонки листаются сами, лента — независимо.
    <div className="grid h-full grid-cols-[1fr_380px] grid-rows-[minmax(0,1fr)]">
      <div className="scroll-slim min-h-0 overflow-y-auto px-7 py-6">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} controls />
          ))}
        </div>
      </div>
      <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Лента событий</h2>
        <div className="min-h-0 flex-1">
          <EventFeed events={events} telemetry={telemetry} devices={devices} />
        </div>
      </aside>
    </div>
  )
}
