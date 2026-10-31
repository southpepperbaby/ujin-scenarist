import type { Device } from '../../api'
import { DeviceCard } from './DeviceCard'

function Group({ title, hint, devices }: { title: string; hint: string; devices: Device[] }) {
  if (devices.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[12px] text-ink-mute">{hint}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {devices.map((device) => (
          <DeviceCard key={device.id} device={device} controls={false} />
        ))}
      </div>
    </section>
  )
}

export function DevicesPage({ devices }: { devices: Device[] }) {
  const building = devices.filter((device) => device.scope === 'building')
  const apartment = devices.filter((device) => device.scope === 'apartment')

  return (
    <div className="space-y-6 px-7 py-6">
      <Group
        title="Общедомовое оборудование"
        hint={`${building.length} устройств · зона ответственности УК`}
        devices={building}
      />
      <Group
        title="Квартира 42"
        hint={`${apartment.length} устройств · правила жителя, УК видит только состояние`}
        devices={apartment}
      />
    </div>
  )
}
