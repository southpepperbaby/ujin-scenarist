import { memo, useState, type ReactNode } from 'react'

import { api, type Device } from '../../api'
import { isAlarm } from '../../shared/device-values'
import { guard } from '../../store'
import { Icon } from '../../shared/ui/Icon'
import { deviceIcon } from '../resident/device-icons'
import { DeviceSignalTable } from './DeviceSignalTable'

type DeviceCardProps = {
  device: Device
  controls: boolean
  /** Кнопки управления карточкой, например «Изменить». */
  actions?: ReactNode
}

/** Карточка в memo: тик одного датчика не перерисовывает остальные карточки сетки. */
export const DeviceCard = memo(function DeviceCard({ device, controls, actions }: DeviceCardProps) {
  // Тот же признак аварии, что у дашборда и плиток жителя: учитывает и alarms своих типов.
  const alarm = isAlarm(device)

  return (
    <article
      className={`rounded-2xl border p-4 ${alarm ? 'border-sev-crit/40 bg-sev-crit-soft/40' : 'border-line bg-surface'} ${
        device.online ? '' : 'opacity-60'
      }`}
    >
      <header className="mb-3 flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
            alarm ? 'bg-sev-crit/20 text-sev-crit' : 'bg-raised text-ink-dim'
          }`}
        >
          <Icon name={alarm ? 'octagon' : deviceIcon(device.family)} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {device.title}
            {alarm && <span className="sr-only"> — авария</span>}
          </p>
          <p className="truncate text-meta text-ink-mute">
            {device.room} · {device.scope === 'building' ? 'дом' : 'квартира'} · {device.id}
          </p>
        </div>
        {!device.online && (
          <span className="shrink-0 rounded-full border border-sev-major/35 bg-sev-major-soft px-2 py-0.5 text-micro text-sev-major">
            нет связи
          </span>
        )}
        {device.online && device.ujin && (
          <span className="shrink-0 rounded-full border border-ok/35 bg-ok-soft px-2 py-0.5 text-micro text-ok">
            Ujin
          </span>
        )}
        {actions}
      </header>

      {controls && device.inputs.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {device.inputs.map((input) => (
            <span key={input} className="flex gap-1">
              <InputButton deviceId={device.id} input={input} value={1} />
              <InputButton deviceId={device.id} input={input} value={0} />
            </span>
          ))}
        </div>
      )}

      <DeviceSignalTable device={device} controls={controls} />
    </article>
  )
})

function InputButton({ deviceId, input, value }: { deviceId: string; input: string; value: number }) {
  const [busy, setBusy] = useState(false)
  const inject = async () => {
    setBusy(true)
    await guard(api.inject(deviceId, input, value))
    setBusy(false)
  }
  return (
    <button
      type="button"
      onClick={() => void inject()}
      disabled={busy}
      aria-label={`${input}: ${value === 1 ? 'подать' : 'снять'}`}
      className="rounded-lg border border-line bg-raised px-2 py-0.5 text-meta text-ink-dim transition hover:text-ink disabled:opacity-50"
    >
      {input} <span aria-hidden="true">{value === 1 ? '▲' : '▼'}</span>
    </button>
  )
}
