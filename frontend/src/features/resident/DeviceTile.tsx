import { memo, useOptimistic, useTransition } from 'react'

import { api, type Device } from '../../api'
import { isAlarm, keySignal } from '../../shared/device-values'
import { guard, useStore } from '../../store'
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

/**
 * Плитка устройства. Переключатель оптимистичный: щёлкает сразу, пока команда в пути показывает
 * индикатор, при ошибке сам возвращается назад (useOptimistic) и объясняет тостом.
 */
export const DeviceTile = memo(function DeviceTile({ device, index = 0 }: { device: Device; index?: number }) {
  const demo = useStore((state) => state.demo)
  const setSignal = useStore((state) => state.setSignal)
  const pulse = PULSE[device.family]
  const toggle = device.signals.find((signal) => SWITCHES.includes(signal.name) && signal.management !== 'r')
  const alarm = isAlarm(device)
  const on = pulse ? pulse.isOn(device) : Number(toggle?.value ?? 0) === 1
  const [shownOn, setShownOn] = useOptimistic(on)
  const [pending, startTransition] = useTransition()

  const flip = () => {
    if (pending) return
    const next = !on
    startTransition(async () => {
      setShownOn(next)
      if (pulse) {
        const [name, arg] = next ? pulse.on : pulse.off
        if (demo) return setSignal(device.id, 'state', next ? 1 : 0)
        const sent = await guard(api.command(device.id, name, arg).then(() => true))
        if (sent) setSignal(device.id, 'state', next ? 1 : 0)
        return
      }
      if (!toggle) return
      const target = next ? 1 : 0
      if (demo) return setSignal(device.id, toggle.name, target)
      const sent = await guard(api.command(device.id, toggle.name, target).then(() => true))
      // Команда принята: применяем сразу, не дожидаясь события шины, чтобы переключатель не мигнул назад.
      if (sent) setSignal(device.id, toggle.name, target)
    })
  }

  return (
    <div
      style={{ '--i': index } as React.CSSProperties}
      className={`rise lift relative flex flex-col gap-3 rounded-2xl p-4 ${
        alarm ? 'border border-sev-crit/40 bg-sev-crit-soft' : 'surface'
      } ${device.online ? '' : 'opacity-60'}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex size-10 items-center justify-center rounded-xl ${
            alarm ? 'animate-float bg-sev-crit/20 text-sev-crit' : shownOn ? 'bg-accent-soft text-accent' : 'bg-raised text-ink-dim'
          }`}
        >
          <Icon name={deviceIcon(device.family)} size={20} />
        </span>
        {(pulse || toggle) && (
          <span className="flex items-center gap-2">
            {pending && <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
            <Toggle checked={shownOn} label={`${device.title}, ${device.room}`} onChange={flip} disabled={!device.online} />
          </span>
        )}
      </div>
      <div>
        <p className="text-meta text-ink-mute">{device.room}</p>
        <p className="truncate text-sm font-medium">{device.title}</p>
        <p
          className={`mt-1 line-clamp-2 text-body leading-snug ${alarm ? 'font-semibold text-sev-crit' : 'text-ink-dim'}`}
        >
          {alarm && <Icon name="octagon" size={13} className="mr-1 inline -translate-y-px" />}
          {device.online ? keySignal(device) : 'нет связи'}
        </p>
      </div>
    </div>
  )
})
