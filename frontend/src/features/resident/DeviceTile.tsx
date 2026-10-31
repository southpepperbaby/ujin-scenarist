import { api, type Device } from '../../api'
import { isAlarm, keySignal } from '../../shared/device-values'
import { guard } from '../../store'
import { Icon } from '../../shared/ui/Icon'
import { Toggle } from '../../shared/ui/Toggle'
import { deviceIcon } from './device-icons'

/** Сигнал-выключатель на плитке: то, чем житель управляет одним касанием. */
const SWITCHES = ['lamp', 'valve']

const value = (d: Device, name: string) => Number(d.signals.find((s) => s.name === name)?.value ?? 0)

/**
 * Устройства с командами-импульсами: «Открыть» шлагбаума сразу возвращается в 0, поэтому положение
 * переключателя берём из состояния стрелы, а закрываем отдельной командой «Закрыть».
 */
const PULSE: Record<string, { isOn: (d: Device) => boolean; on: [string, number]; off: [string, number] }> = {
  barrier: { isOn: (d) => [1, 2, 4].includes(value(d, 'state')), on: ['open_cmd', 1], off: ['close_cmd', 1] },
}

export function DeviceTile({ device, index = 0 }: { device: Device; index?: number }) {
  const pulse = PULSE[device.family]
  const toggle = device.signals.find((signal) => SWITCHES.includes(signal.name) && signal.management !== 'r')
  const alarm = isAlarm(device)
  const on = pulse ? pulse.isOn(device) : Number(toggle?.value ?? 0) === 1

  const flip = () => {
    if (pulse) {
      const [name, next] = on ? pulse.off : pulse.on
      return void guard(api.command(device.id, name, next))
    }
    if (toggle) void guard(api.command(device.id, toggle.name, on ? 0 : 1))
  }

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
        {(pulse || toggle) && <Toggle checked={on} label={device.title} onChange={flip} />}
      </div>
      <div>
        <p className="text-[13px] text-ink-mute">{device.room}</p>
        <p className="truncate text-sm font-medium">{device.title}</p>
        <p className={`mt-1 line-clamp-2 text-[13px] leading-snug ${alarm ? 'font-semibold text-sev-crit' : 'text-ink-dim'}`}>
          {device.online ? keySignal(device) : 'нет связи'}
        </p>
      </div>
    </div>
  )
}
