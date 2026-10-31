import { useEffect, useState } from 'react'
import { api, openEvents, type BusEvent, type Device, type SignalDecl } from './api'

const GROUP_TITLES: Record<string, string> = {
  property: 'Свойства',
  capability: 'Возможности',
  setting: 'Настройки',
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>([])
  const [events, setEvents] = useState<BusEvent[]>([])

  useEffect(() => {
    api.devices().then(setDevices)
    api.events(50).then(setEvents)
    return openEvents((e) => {
      setEvents((prev) => [...prev.slice(-199), e])
      if (e.kind === 'signal' && e.device_id) {
        setDevices((prev) =>
          prev.map((d) =>
            d.id === e.device_id
              ? { ...d, signals: d.signals.map((s) => (s.name === e.signal ? { ...s, value: e.value! } : s)) }
              : d,
          ),
        )
      }
      if (e.kind === 'device') api.devices().then(setDevices)
    })
  }, [])

  return (
    <div className="min-h-screen grid grid-cols-[1fr_380px]">
      <main className="p-6 space-y-6">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Сценарист</h1>
          <span className="text-sm text-gray-500">песочница устройств</span>
        </header>
        <section className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </section>
      </main>
      <aside className="border-l border-gray-200 bg-white p-4 overflow-y-auto h-screen sticky top-0">
        <h2 className="font-medium mb-3">Лента событий</h2>
        <ul className="space-y-1 text-sm font-mono">
          {[...events].reverse().map((e) => (
            <li key={e.seq} className={e.kind === 'log' ? 'text-gray-400' : 'text-gray-800'}>
              <span className="text-gray-400">{new Date(e.ts * 1000).toLocaleTimeString()} </span>
              {e.kind === 'signal' && (
                <>
                  <b>{e.device_id}</b> {e.title ?? e.signal}: {String(e.prev)} → {String(e.value)}
                </>
              )}
              {e.kind === 'log' && <>{e.message}</>}
              {e.kind === 'device' && <>{e.device_id} {e.action}</>}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

function DeviceCard({ device }: { device: Device }) {
  const groups = ['property', 'capability', 'setting'] as const
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">{device.title}</div>
          <div className="text-xs text-gray-500">
            {device.room} · {device.scope === 'building' ? 'дом' : 'квартира'} · {device.id}
          </div>
        </div>
        {device.ujin && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Ujin
          </span>
        )}
      </div>
      {device.inputs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {device.inputs.map((inp) => (
            <span key={inp} className="flex gap-1">
              <button className="btn" onClick={() => api.inject(device.id, inp, 1)}>
                {inp} ▲
              </button>
              <button className="btn" onClick={() => api.inject(device.id, inp, 0)}>
                {inp} ▼
              </button>
            </span>
          ))}
        </div>
      )}
      {groups.map((g) => {
        const rows = device.signals.filter((s) => s.group === g)
        if (!rows.length) return null
        return (
          <div key={g}>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{GROUP_TITLES[g]}</div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((s) => (
                  <SignalRow key={s.name} device={device} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function SignalRow({ device, s }: { device: Device; s: SignalDecl }) {
  const writable = s.management !== 'r'
  const shown = s.layout?.[String(s.value)] ?? `${s.value}${s.measure ? ' ' + s.measure : ''}`
  return (
    <tr className="border-t border-gray-100">
      <td className="py-1 text-gray-600">
        {s.title} <span className="text-gray-300 text-xs">{s.name}</span>
      </td>
      <td className="py-1 text-right">
        {writable && s.layout && Object.keys(s.layout).length <= 4 ? (
          <span className="flex gap-1 justify-end">
            {Object.entries(s.layout).map(([v, label]) => (
              <button
                key={v}
                className={`btn ${String(s.value) === v ? 'btn-active' : ''}`}
                onClick={() => api.command(device.id, s.name, Number(v))}
              >
                {label}
              </button>
            ))}
          </span>
        ) : writable && s.control === 'push_time' ? (
          <button className="btn" onClick={() => api.command(device.id, s.name, 1)}>
            {s.title}
          </button>
        ) : writable ? (
          <input
            className="w-20 text-right border border-gray-200 rounded px-1"
            defaultValue={String(s.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') api.command(device.id, s.name, Number((e.target as HTMLInputElement).value))
            }}
          />
        ) : (
          <span className="font-mono">{shown}</span>
        )}
      </td>
    </tr>
  )
}
