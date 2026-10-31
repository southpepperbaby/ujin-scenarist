import { useState } from 'react'

import type { Device } from '../../api'
import { Button } from '../../shared/ui/Button'
import { useStore } from '../../store'
import { DeviceCard } from './DeviceCard'
import { DeviceFormModal } from './DeviceFormModal'
import { DeviceTypesModal } from './DeviceTypesModal'

type ModalState =
  | { kind: 'device'; device?: Device }
  | { kind: 'types'; startNew: boolean }
  | null

function Group({
  title,
  hint,
  devices,
  onEdit,
}: {
  title: string
  hint: string
  devices: Device[]
  onEdit: (device: Device) => void
}) {
  if (devices.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[12px] text-ink-mute">{hint}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            controls={false}
            actions={
              <button
                type="button"
                onClick={() => onEdit(device)}
                className="shrink-0 rounded-lg px-2 py-0.5 text-[12px] text-ink-dim transition hover:bg-raised hover:text-ink"
              >
                Изменить
              </button>
            }
          />
        ))}
      </div>
    </section>
  )
}

export function DevicesPage({ devices }: { devices: Device[] }) {
  const families = useStore((state) => state.families)
  const [modal, setModal] = useState<ModalState>(null)
  const building = devices.filter((device) => device.scope === 'building')
  const apartment = devices.filter((device) => device.scope === 'apartment')
  const close = () => setModal(null)

  return (
    <div className="space-y-6 px-7 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon="plus" onClick={() => setModal({ kind: 'device' })}>
          Добавить устройство
        </Button>
        <Button variant="secondary" onClick={() => setModal({ kind: 'types', startNew: false })}>
          Типы устройств
        </Button>
      </div>

      {devices.length === 0 && <p className="text-sm text-ink-mute">Устройств пока нет. Добавьте первое.</p>}

      <Group
        title="Общедомовое оборудование"
        hint={`${building.length} устройств · зона ответственности УК`}
        devices={building}
        onEdit={(device) => setModal({ kind: 'device', device })}
      />
      <Group
        title="Квартира 42"
        hint={`${apartment.length} устройств · правила жителя, УК видит только состояние`}
        devices={apartment}
        onEdit={(device) => setModal({ kind: 'device', device })}
      />

      {modal?.kind === 'device' && (
        <DeviceFormModal
          device={modal.device}
          families={families}
          onClose={close}
          onNewType={() => setModal({ kind: 'types', startNew: true })}
        />
      )}
      {modal?.kind === 'types' && (
        <DeviceTypesModal key={String(modal.startNew)} families={families} startNew={modal.startNew} onClose={close} />
      )}
    </div>
  )
}
