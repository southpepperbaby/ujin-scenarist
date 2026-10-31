import { api, type Device } from '../../api'
import { isAlarm, keySignal } from '../../shared/device-values'
import { guard } from '../../store'
import { Icon } from '../../shared/ui/Icon'
import { Toggle } from '../../shared/ui/Toggle'
import { deviceIcon } from './device-icons'

/** Сигнал-выключатель на плитке: то, чем житель управляет одним касанием. */
const SWITCHES = ['lamp', 'valve']

/** Стрела шлагбаума поднята или поднимается (state: открывается, открыто, удержание). */
const BARRIER_UP = [1, 2, 4]

type TileControl = { on: boolean; command: () => [string, number] }

/**
 * У шлагбаума open_cmd разовый: эмулятор сразу сбрасывает его в 0, а закрывает отдельный close_cmd.
 * Поэтому положение ползунка берём из state, а по нажатию шлём нужную из двух команд.
 */
function tileControl(device: Device): TileControl | null {
  if (device.family === 'barrier') {
    const up = BARRIER_UP.includes(Number(device.signals.find((s) => s.name === 'state')?.value))
    return { on: up, command: () => (up ? ['close_cmd', 1] : ['open_cmd', 1]) }
  }
  const toggle = device.signals.find((signal) => SWITCHES.includes(signal.name) && signal.management !== 'r')
  if (!toggle) return null
  const on = Number(toggle.value ?? 0) === 1
  return { on, command: () => [toggle.name, on ? 0 : 1] }
}

export function DeviceTile({ device, index = 0 }: { device: Device; index?: number }) {
  const control = tileControl(device)
  const alarm = isAlarm(device)

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
        {control && (
          <Toggle
            checked={control.on}
            label={device.title}
            onChange={() => void guard(api.command(device.id, ...control.command()))}
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
