import { navigate } from '../../app/routing'
import { levelOfNotice, levelStyle } from '../../shared/severity'
import { formatClock } from '../../shared/format'
import { Icon } from '../../shared/ui/Icon'
import { showValue } from '../../shared/device-values'
import { useStore } from '../../store'
import type { Device, Notification } from '../../api'
import { DeviceTile } from './DeviceTile'

function readSignal(devices: Device[], family: string, name: string): string {
  const signal = devices.find((device) => device.family === family)?.signals.find((s) => s.name === name)
  return signal ? showValue(signal) : '—'
}

function Summary({ devices }: { devices: Device[] }) {
  const tiles = [
    { label: 'В спальне', value: readSignal(devices, 'thermostat', 'temperature'), icon: 'thermometer' as const },
    { label: 'Влажность', value: readSignal(devices, 'thermostat', 'humidity'), icon: 'droplet' as const },
    { label: 'Устройств', value: String(devices.length), icon: 'grid' as const },
  ]
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border border-line bg-surface p-3">
          <Icon name={tile.icon} size={18} className="text-ink-mute" />
          <p className="mt-2 truncate text-base font-semibold">{tile.value}</p>
          <p className="truncate text-[11px] text-ink-mute">{tile.label}</p>
        </div>
      ))}
    </div>
  )
}

function AlertBanner({ notice }: { notice: Notification }) {
  const style = levelStyle(levelOfNotice(notice.level))
  return (
    <button
      type="button"
      onClick={() => navigate('/resident/alerts')}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left ${style.bg} ${style.border}`}
    >
      <Icon name={style.icon} size={20} className={`mt-0.5 shrink-0 ${style.text}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{notice.rule_title ?? 'Система'}</p>
        <p className="mt-1 text-[13px] leading-snug text-ink-dim">{notice.message}</p>
      </div>
      <span className="shrink-0 text-[12px] text-ink-mute">{formatClock(notice.ts)}</span>
    </button>
  )
}

export function HomeScreen({ demo }: { demo: boolean }) {
  const devices = useStore((state) => state.devices)
  const notifications = useStore((state) => state.notifications)
  const rules = useStore((state) => state.rules)

  const mine = devices.filter((device) => device.scope === 'apartment')
  const shared = devices.filter((device) => device.scope === 'building')
  const forResident = notifications.filter((notice) => notice.target === 'resident')
  const latest = forResident.at(-1)
  const active = rules.filter((rule) => rule.owner === 'resident' && rule.enabled)

  return (
    <div className="space-y-6 px-5 pt-4 pb-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-ink-mute">ЖК «Северный», корп. 1</p>
          <h1 className="text-2xl">Квартира 2806</h1>
        </div>
        <span className="flex size-10 items-center justify-center rounded-full bg-raised text-ink-dim">
          <Icon name="user" size={20} />
        </span>
      </header>

      {demo && (
        <p className="rounded-xl border border-line bg-raised px-3 py-2 text-[12px] text-ink-mute">
          Бэкенд не отвечает — показан демо-набор данных.
        </p>
      )}

      <Summary devices={mine} />
      {latest && <AlertBanner notice={latest} />}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Мои устройства</h2>
          <span className="text-[13px] text-ink-mute">{mine.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {mine.map((device, index) => (
            <DeviceTile key={device.id} device={device} index={index} />
          ))}
        </div>
      </section>

      {active.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Сценарии работают</h2>
            <button
              type="button"
              onClick={() => navigate('/resident/scenarios')}
              className="text-[13px] font-medium text-accent"
            >
              Все
            </button>
          </div>
          <div className="space-y-2">
            {active.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => navigate(`/resident/scenarios/${rule.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon name="bolt" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{rule.title}</span>
                  <span className="block truncate text-[12px] text-ink-mute">{rule.description}</span>
                </span>
                <Icon name="chevronRight" size={18} className="shrink-0 text-ink-mute" />
              </button>
            ))}
          </div>
        </section>
      )}

      {shared.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Общедомовое</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {shared.map((device, index) => (
              <DeviceTile key={device.id} device={device} index={index} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
