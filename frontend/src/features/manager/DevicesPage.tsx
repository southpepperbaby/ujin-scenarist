import { useCallback, useState } from 'react'

import type { Device } from '../../api'
import { useAction } from '../../shared/actions'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useStore } from '../../store'
import { DeviceCard } from './DeviceCard'
import { DeviceFormModal, type DeviceDraft } from './DeviceFormModal'
import { DeviceTypesModal } from './DeviceTypesModal'

type ModalState =
  | { kind: 'device'; device?: Device; draft?: DeviceDraft }
  /** returnTo — форма устройства, из которой ушли создавать тип: после типа вернёмся в неё. */
  | { kind: 'types'; startNew: boolean; returnTo?: DeviceDraft }
  | null

export function DevicesPage({ devices }: { devices: Device[] }) {
  const families = useStore((state) => state.families)
  const loaded = useStore((state) => state.loaded)
  const [modal, setModal] = useState<ModalState>(null)
  // Кабинет УК ведёт только общедомовое оборудование: квартирное принадлежит жителю.
  const building = devices.filter((device) => device.scope === 'building')
  const close = () => setModal(null)
  const create = useCallback(() => setModal({ kind: 'device' }), [])
  useAction('new-device', create)

  return (
    <div className="space-y-6 px-7 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon="plus" onClick={create}>
          Добавить устройство
        </Button>
        <Button variant="secondary" onClick={() => setModal({ kind: 'types', startNew: false })}>
          Типы устройств
        </Button>
      </div>

      {!loaded && (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" role="status">
          <span className="sr-only">Загружаем устройства…</span>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-52" />
          ))}
        </div>
      )}

      {loaded && building.length === 0 && (
        <EmptyState
          icon="building"
          title="Общедомового оборудования пока нет"
          hint="Добавьте шлагбаум, лифт или датчик протечки в подвале — они сразу появятся в песочнице."
          action={
            <Button variant="primary" icon="plus" onClick={create}>
              Добавить первое устройство
            </Button>
          }
          className="surface rounded-2xl"
        />
      )}

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
                aria-label={`Изменить «${device.title}»`}
                className="shrink-0 rounded-lg px-2 py-0.5 text-meta text-ink-dim transition hover:bg-raised hover:text-ink"
              >
                Изменить
              </button>
            }
          />
        ))}
      </div>

      {modal?.kind === 'device' && (
        <DeviceFormModal
          key={modal.device?.id ?? 'new'}
          device={modal.device}
          draft={modal.draft}
          families={families}
          onClose={close}
          onNewType={(draft) => setModal({ kind: 'types', startNew: true, returnTo: draft })}
        />
      )}
      {modal?.kind === 'types' && (
        <DeviceTypesModal
          key={String(modal.startNew)}
          families={families}
          startNew={modal.startNew}
          onClose={() => (modal.returnTo ? setModal({ kind: 'device', draft: modal.returnTo }) : close())}
        />
      )}
    </div>
  )
}
