import { useState } from 'react'

import { api, type Contractor, type Device } from '../../api'
import { formatDuration } from '../../shared/format'
import { Button } from '../../shared/ui/Button'
import { ErrorNote, Field, Segmented, SelectInput, TextInput } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'

type TicketFormModalProps = {
  devices: Device[]
  contractors: Contractor[]
  categories: Record<string, string>
  onClose: () => void
  onCreated: () => void
}

const LEVELS = [
  { value: '0', label: 'Инфо' },
  { value: '1', label: 'Минор' },
  { value: '2', label: 'Мажор' },
  { value: '3', label: 'Критично' },
] as const

type Level = (typeof LEVELS)[number]['value']

/** Ручная заявка подрядчику: УК заводит то, что автодиспетчер не увидел (обход, звонок жителя). */
export function TicketFormModal({ devices, contractors, categories, onClose, onCreated }: TicketFormModalProps) {
  const building = devices.filter((device) => device.scope === 'building')
  const [category, setCategory] = useState(Object.keys(categories)[0] ?? 'general')
  const [level, setLevel] = useState<Level>('1')
  const [deviceId, setDeviceId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const contractor = contractors.find((item) => item.category === category)

  const submit = async (send: boolean) => {
    if (title.trim().length === 0) {
      setError('Напишите, что случилось: это заголовок заявки для подрядчика.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.createTicket({
        category,
        level: Number(level),
        title: title.trim(),
        description: description.trim(),
        device_id: deviceId || null,
        send,
      })
      onCreated()
      onClose()
    } catch (cause) {
      setError(`Не удалось создать заявку: ${(cause as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Новая заявка"
      onClose={onClose}
      footer={
        <div className={`flex w-full flex-wrap gap-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          <Button variant="bright" icon="arrowRight" onClick={() => void submit(true)}>
            Отправить подрядчику
          </Button>
          <Button variant="secondary" onClick={() => void submit(false)}>
            В черновик
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Что случилось">
          <TextInput
            className="w-full"
            value={title}
            autoFocus
            placeholder="Например, не закрывается дверь в подъезд 1"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field label="Подробности" hint="Подрядчик увидит этот текст в заявке">
          <textarea
            value={description}
            rows={3}
            placeholder="Где именно, с какого времени, что уже проверили"
            onChange={(event) => setDescription(event.target.value)}
            className="scroll-slim w-full resize-none rounded-lg border border-line bg-field px-2.5 py-1.5 text-[13px] text-ink outline-none transition placeholder:text-ink-mute focus:border-accent/60"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Категория">
            <SelectInput className="w-full" value={category} onChange={(event) => setCategory(event.target.value)}>
              {Object.entries(categories).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Устройство">
            <SelectInput className="w-full" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
              <option value="">Без устройства</option>
              {building.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.title} · {device.room}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <Field label="Срочность">
          <div>
            <Segmented value={level} options={[...LEVELS]} onChange={setLevel} />
          </div>
        </Field>

        {contractor && (
          <p className="rounded-lg border border-line bg-field/50 px-3 py-2 text-[12px] text-ink-dim">
            Уйдёт подрядчику <span className="font-medium text-ink">{contractor.name}</span> · реакция{' '}
            {formatDuration(contractor.sla_minutes)}
          </p>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
