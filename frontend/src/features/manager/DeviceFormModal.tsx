import { useState } from 'react'

import { api, type Device, type Family } from '../../api'
import { toastOk } from '../../shared/toast'
import { Button } from '../../shared/ui/Button'
import { ConfirmDeleteButton } from '../../shared/ui/DeleteButtons'
import { ErrorNote, Field, SelectInput, TextInput } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'
import { Toggle } from '../../shared/ui/Toggle'
import { guard, useStore } from '../../store'

/** Введённое в форму нового устройства: переживает переход к созданию своего типа. */
export type DeviceDraft = { family: string; title: string; titleTouched: boolean; room: string }

type DeviceFormModalProps = {
  /** Устройство для правки. Без него окно создаёт новое. */
  device?: Device
  families: Family[]
  draft?: DeviceDraft
  onClose: () => void
  onNewType: (draft: DeviceDraft) => void
}

/** Кабинет УК заводит только общедомовое оборудование: квартирное принадлежит жителю. */
const SCOPE: Device['scope'] = 'building'

export function DeviceFormModal({ device, families, draft, onClose, onNewType }: DeviceFormModalProps) {
  const editing = Boolean(device)
  const [chosenFamily, setFamily] = useState(device?.family ?? draft?.family ?? '')
  const [typedTitle, setTitle] = useState(device?.title ?? draft?.title ?? '')
  const [titleTouched, setTitleTouched] = useState(editing || Boolean(draft?.titleTouched))
  const [room, setRoom] = useState(device?.room ?? draft?.room ?? '')
  const [online, setOnline] = useState(device?.online ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const builtin = families.filter((item) => !item.custom)
  const custom = families.filter((item) => item.custom)

  // Типы могли приехать позже окна (демо, медленная сеть): пока тип не выбран, берём первый.
  const family = chosenFamily || families[0]?.family || ''
  const title = titleTouched || typedTitle ? typedTitle : (families.find((item) => item.family === family)?.title ?? '')

  const pickFamily = (next: string) => {
    setFamily(next)
    if (!titleTouched) setTitle(families.find((item) => item.family === next)?.title ?? '')
  }

  const run = async (action: () => Promise<unknown>, done: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      return
    }
    toastOk(done)
    onClose()
    // Список обновляем после закрытия: сбой обновления — тост, операция уже прошла.
    void guard(useStore.getState().reloadDevices())
  }

  const save = () => {
    if (!title.trim()) return setError('Укажите название устройства')
    if (!editing && !family) return setError('Выберите тип устройства')
    void run(
      () =>
        device
          ? api.patchDevice(device.id, { title: title.trim(), room: room.trim(), scope: SCOPE, online })
          : api.createDevice({ family, title: title.trim(), room: room.trim(), scope: SCOPE }),
      editing ? 'Устройство сохранено' : 'Устройство добавлено',
    )
  }

  const dirty = editing
    ? title !== device?.title || room !== device?.room || online !== device?.online
    : titleTouched || room.trim() !== ''

  return (
    <Modal
      title={editing ? 'Изменить устройство' : 'Добавить устройство'}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={save} busy={busy}>
            {editing ? 'Сохранить' : 'Добавить'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <span className="flex-1" />
          {device && (
            <ConfirmDeleteButton
              onConfirm={() => void run(() => api.deleteDevice(device.id), 'Устройство удалено')}
              label={`Удалить «${device.title}»`}
            />
          )}
        </>
      }
    >
      <form
        className={`space-y-4 ${busy ? 'opacity-60' : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          {!editing && (
            <div className="space-y-1">
              <Field label="Тип устройства">
                <SelectInput className="w-full" value={family} onChange={(event) => pickFamily(event.target.value)}>
                  {families.length === 0 && <option value="">Типы загружаются…</option>}
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
              </Field>
              <button
                type="button"
                onClick={() => onNewType({ family, title, titleTouched, room })}
                className="text-meta text-accent hover:brightness-110"
              >
                Нужного типа нет? Создать свой
              </button>
            </div>
          )}

          <Field label="Название">
            <TextInput
              className="w-full"
              value={title}
              autoFocus
              required
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
                <p className="text-body">На связи</p>
                <p className="text-caption text-ink-mute">Если выключить, устройство перестанет отвечать</p>
              </div>
              <Toggle checked={online} onChange={setOnline} label="На связи" />
            </div>
          )}
        </fieldset>

        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}
