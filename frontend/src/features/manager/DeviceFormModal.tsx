import { useState } from 'react'

import { api, type Device, type Family } from '../../api'
import { Button } from '../../shared/ui/Button'
import { ErrorNote, Field, SelectInput, TextInput } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'
import { Toggle } from '../../shared/ui/Toggle'
import { useStore } from '../../store'


type DeviceFormModalProps = {
  /** Устройство для правки. Без него окно создаёт новое. */
  device?: Device
  families: Family[]
  onClose: () => void
  onNewType: () => void
}

/** Кабинет УК заводит только общедомовое оборудование: квартирное принадлежит жителю. */
const SCOPE: Device['scope'] = 'building'

export function DeviceFormModal({ device, families, onClose, onNewType }: DeviceFormModalProps) {
  const editing = Boolean(device)
  const [family, setFamily] = useState(device?.family ?? families[0]?.family ?? '')
  const [title, setTitle] = useState(device?.title ?? families[0]?.title ?? '')
  const [titleTouched, setTitleTouched] = useState(editing)
  const [room, setRoom] = useState(device?.room ?? '')
  const [online, setOnline] = useState(device?.online ?? true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const builtin = families.filter((item) => !item.custom)
  const custom = families.filter((item) => item.custom)

  const pickFamily = (next: string) => {
    setFamily(next)
    if (!titleTouched) setTitle(families.find((item) => item.family === next)?.title ?? '')
  }

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      await useStore.getState().reloadDevices()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const save = () =>
    run(() =>
      device
        ? api.patchDevice(device.id, { title: title.trim(), room: room.trim(), scope: SCOPE, online })
        : api.createDevice({ family, title: title.trim(), room: room.trim(), scope: SCOPE }),
    )

  return (
    <Modal
      title={editing ? 'Изменить устройство' : 'Добавить устройство'}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {editing ? 'Сохранить' : 'Добавить'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <span className="flex-1" />
          {device &&
            (confirmDelete ? (
              <Button variant="danger" onClick={() => void run(() => api.deleteDevice(device.id))}>
                Да, удалить
              </Button>
            ) : (
              <Button variant="ghost" className="text-sev-crit" onClick={() => setConfirmDelete(true)}>
                Удалить
              </Button>
            ))}
        </>
      }
    >
      <div className={`space-y-4 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        {!editing && (
          <Field label="Тип устройства">
            <SelectInput className="w-full" value={family} onChange={(event) => pickFamily(event.target.value)}>
              <optgroup label="Готовые">
                {builtin.map((item) => (
                  <option key={item.family} value={item.family}>
                    {item.title}
                  </option>
                ))}
              </optgroup>
              {custom.length > 0 && (
                <optgroup label="Свои">
                  {custom.map((item) => (
                    <option key={item.family} value={item.family}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </SelectInput>
            <button type="button" onClick={onNewType} className="pt-1 text-[12px] text-accent hover:brightness-110">
              Нужного типа нет? Создать свой
            </button>
          </Field>
        )}

        <Field label="Название">
          <TextInput
            className="w-full"
            value={title}
            placeholder="Например, шлагбаум у въезда"
            onChange={(event) => {
              setTitle(event.target.value)
              setTitleTouched(true)
            }}
          />
        </Field>

        <Field label="Помещение">
          <TextInput
            className="w-full"
            value={room}
            placeholder="Двор, подъезд, подвал"
            onChange={(event) => setRoom(event.target.value)}
          />
        </Field>

        {editing && (
          <div className="flex items-center justify-between rounded-lg border border-line bg-field/50 px-3 py-2">
            <div>
              <p className="text-[13px]">На связи</p>
              <p className="text-[11px] text-ink-mute">Если выключить, устройство перестанет отвечать</p>
            </div>
            <Toggle checked={online} onChange={setOnline} label="На связи" />
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
