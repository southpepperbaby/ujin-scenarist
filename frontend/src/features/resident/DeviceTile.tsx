import { api, type Device } from '../../api'
import { isAlarm, keySignal } from '../../shared/device-values'
import { guard } from '../../store'
import { Icon } from '../../shared/ui/Icon'
import { Toggle } from '../../shared/ui/Toggle'
import { deviceIcon } from './device-icons'

/** Сигнал-выключатель на плитке: то, чем житель управляет одним касанием. */
const SWITCHES = ['lamp', 'valve', 'open_cmd']

export function DeviceTile({ device, index = 0 }: { device: Device; index?: number }) {
  const toggle = device.signals.find((signal) => SWITCHES.includes(signal.name) && signal.management !== 'r')
  const alarm = isAlarm(device)
  const on = Number(toggle?.value ?? 0) === 1

  return (
    <div
      style={{ '--i': index } as React.CSSProperties}
      className={`rise lift flex flex-col gap-3 rounded-2xl p-4 ${
        alarm ? 'border border-sev-crit/40 bg-sev-crit-soft' : 'glass'
      } ${device.online ? '' : 'opacity-55'}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex size-10 items-center justify-center rounded-xl ${
            alarm ? 'animate-float bg-sev-crit/20 text-sev-crit' : 'bg-raised/70 text-ink-dim'
          }`}
        >
          <Icon name={deviceIcon(device.family)} size={20} />
        </span>
        {toggle && (
          <Toggle
            checked={on}
            label={device.title}
            onChange={() => void guard(api.command(device.id, toggle.name, on ? 0 : 1))}
          />
        )}
      </div>
      <div>
        <p className="text-[13px] text-ink-mute">{device.room}</p>
        <p className="truncate text-sm font-medium">{device.title}</p>
        <p className={`mt-1 truncate text-[13px] ${alarm ? 'font-semibold text-sev-crit' : 'text-ink-dim'}`}>
          {device.online ? keySignal(device) : 'нет связи'}
        </p>
      </div>
    </div>
  )
}
