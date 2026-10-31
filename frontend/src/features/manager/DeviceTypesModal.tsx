import { useState } from 'react'

import { api, type Family } from '../../api'
import { toastOk } from '../../shared/toast'
import { Button } from '../../shared/ui/Button'
import { ConfirmDeleteButton } from '../../shared/ui/DeleteButtons'
import { ErrorNote } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'
import { guard, useStore } from '../../store'
import { TypeEditor } from './TypeEditor'

type DeviceTypesModalProps = {
  families: Family[]
  /** Сразу открыть форму нового типа. */
  startNew?: boolean
  onClose: () => void
}

export function DeviceTypesModal({ families, startNew = false, onClose }: DeviceTypesModalProps) {
  const [editing, setEditing] = useState<{ family: Family | null } | null>(startNew ? { family: null } : null)
  const [error, setError] = useState('')

  // Обновление списка после успешной операции: его сбой — тост, а не ошибка самой операции.
  const refresh = () => void guard(useStore.getState().load())

  const remove = async (family: Family) => {
    setError('')
    try {
      await api.deleteType(family.family)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    toastOk(`Тип «${family.title}» удалён`)
    refresh()
  }

  if (editing) {
    return (
      <TypeEditor
        family={editing.family}
        families={families}
        onClose={onClose}
        onBack={() => setEditing(null)}
        onSaved={() => {
          refresh()
          // Пришли сюда из формы устройства: после сохранения возвращаемся в неё, а не в список типов.
          if (startNew) onClose()
          else setEditing(null)
        }}
      />
    )
  }

  return (
    <Modal
      title="Типы устройств"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="primary" icon="plus" onClick={() => setEditing({ family: null })}>
            Свой тип
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {error && <ErrorNote>{error}</ErrorNote>}
        {families.map((item) => (
          <div key={item.family} className="flex items-center gap-3 rounded-xl border border-line bg-raised/40 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-meta text-ink-mute">
                {item.declaration.length} сигналов · {item.custom ? 'свой тип' : 'готовый, только чтение'}
              </p>
              {item.behavior?.map((line, index) => (
                <p key={`${index}-${line}`} className="text-meta text-ink-dim">
                  {line}
                </p>
              ))}
            </div>
            {item.custom && (
              <>
                <Button variant="ghost" onClick={() => setEditing({ family: item })} label={`Изменить тип «${item.title}»`}>
                  Изменить
                </Button>
                <ConfirmDeleteButton onConfirm={() => void remove(item)} label={`Удалить тип «${item.title}»`} />
              </>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
