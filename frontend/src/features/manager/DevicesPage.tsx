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

export function DevicesPage({ devices }: { devices: Device[] }) {
  const families = useStore((state) => state.families)
  const [modal, setModal] = useState<ModalState>(null)
  // Кабинет УК ведёт только общедомовое оборудование: квартирное принадлежит жителю.
  const building = devices.filter((device) => device.scope === 'building')
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

      {building.length === 0 && <p className="text-sm text-ink-mute">Устройств пока нет. Добавьте первое.</p>}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {building.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            controls={false}
            actions={
              <button
                type="button"
                onClick={() => setModal({ kind: 'device', device })}
                className="shrink-0 rounded-lg px-2 py-0.5 text-[12px] text-ink-dim transition hover:bg-raised hover:text-ink"
              >
                Изменить
              </button>
            }
          />
        ))}
      </div>

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
