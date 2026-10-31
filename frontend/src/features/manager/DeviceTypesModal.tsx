import { useState } from 'react'

import { api, type Family, type SignalGroup, type SignalValueType } from '../../api'
import { Button } from '../../shared/ui/Button'
import { ErrorNote, Field, SelectInput, TextInput } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'
import { useStore } from '../../store'
import { BehaviorEditor } from './BehaviorEditor'
import {
  GROUPS,
  TYPE_TITLES,
  behaviorFromSpec,
  buildSpec,
  emptyRow,
  familyCode,
  rowFromSpec,
  rowLayout,
  typesForGroup,
  validate,
  validateBehaviors,
  type BehaviorRow,
  type SignalRow,
} from './device-type-form'

type DeviceTypesModalProps = {
  families: Family[]
  /** Сразу открыть форму нового типа. */
  startNew?: boolean
  onClose: () => void
}

export function DeviceTypesModal({ families, startNew = false, onClose }: DeviceTypesModalProps) {
  const [editing, setEditing] = useState<{ family: Family | null } | null>(startNew ? { family: null } : null)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const refresh = () => useStore.getState().load()

  const remove = async (family: string) => {
    setError('')
    try {
      await api.deleteType(family)
      setConfirm('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (editing) {
    return (
      <TypeEditor
        family={editing.family}
        families={families}
        onClose={onClose}
        onBack={() => setEditing(null)}
        onSaved={async () => {
          await refresh()
          setEditing(null)
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
              <p className="truncate text-[14px] font-medium">{item.title}</p>
              <p className="text-[12px] text-ink-mute">
                {item.declaration.length} сигналов · {item.custom ? 'свой тип' : 'готовый, только чтение'}
              </p>
              {item.behavior?.map((line) => (
                <p key={line} className="text-[12px] text-ink-dim">
                  {line}
                </p>
              ))}
            </div>
            {item.custom && (
              <>
                <Button variant="ghost" onClick={() => setEditing({ family: item })}>
                  Изменить
                </Button>
                {confirm === item.family ? (
                  <Button variant="danger" onClick={() => void remove(item.family)}>
                    Да, удалить
                  </Button>
                ) : (
                  <Button variant="ghost" className="text-sev-crit" onClick={() => setConfirm(item.family)}>
                    Удалить
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

type TypeEditorProps = {
  family: Family | null
  families: Family[]
  onClose: () => void
  onBack: () => void
  onSaved: () => Promise<void>
}

function TypeEditor({ family, families, onClose, onBack, onSaved }: TypeEditorProps) {
  const spec = family?.spec ?? null
  const [title, setTitle] = useState(spec?.title ?? '')
  const [rows, setRows] = useState<SignalRow[]>(() =>
    spec ? spec.signals.map(rowFromSpec) : [{ ...emptyRow('property'), title: 'Показание', measure: '' }],
  )
  const [behaviors, setBehaviors] = useState<BehaviorRow[]>(() =>
    spec?.behaviors ? spec.behaviors.map((b) => behaviorFromSpec(b, rows)) : [],
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (uid: number, patch: Partial<SignalRow>) =>
    setRows((list) => list.map((row) => (row.uid === uid ? { ...row, ...patch } : row)))

  const changeType = (row: SignalRow, type: SignalValueType) => {
    const values = type === 'switch' ? 'выкл, вкл' : type === 'list' && !row.values ? 'норма, сработало' : row.values
    update(row.uid, { type, values, def: type === 'switch' ? '0' : '', alarm: '' })
  }

  const save = async () => {
    const problem = validate(title, rows) || validateBehaviors(behaviors, rows)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      if (family) {
        await api.updateType(buildSpec(family.family, title, rows, behaviors))
      } else {
        const code = familyCode(title, new Set(families.map((item) => item.family)))
        await api.createType(buildSpec(code, title, rows, behaviors))
      }
      await onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={family ? `Тип: ${family.title}` : 'Новый тип устройства'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="primary" onClick={() => void save()}>
            Сохранить тип
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Назад
          </Button>
        </>
      }
    >
      <div className={`space-y-5 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <Field
          label="Название типа"
          hint={family ? 'Устройства этого типа пересоздадутся с новыми сигналами, название и комната сохранятся' : undefined}
        >
          <TextInput
            className="w-full"
            value={title}
            placeholder="Например, датчик давления"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.group === group.key)
          return (
            <section key={group.key} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[13px] font-semibold">{group.title}</h3>
                <span className="text-[12px] text-ink-mute">{group.hint}</span>
              </div>
              {groupRows.map((row) => (
                <SignalEditor
                  key={row.uid}
                  row={row}
                  onChange={(patch) => update(row.uid, patch)}
                  onType={(type) => changeType(row, type)}
                  onRemove={() => setRows((list) => list.filter((item) => item.uid !== row.uid))}
                />
              ))}
              <button
                type="button"
                onClick={() => setRows((list) => [...list, emptyRow(group.key as SignalGroup)])}
                className="text-[12px] font-medium text-accent hover:brightness-110"
              >
                + добавить сигнал
              </button>
            </section>
          )
        })}

        <BehaviorEditor rows={rows} behaviors={behaviors} onChange={setBehaviors} />

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

type SignalEditorProps = {
  row: SignalRow
  onChange: (patch: Partial<SignalRow>) => void
  onType: (type: SignalValueType) => void
  onRemove: () => void
}

function SignalEditor({ row, onChange, onType, onRemove }: SignalEditorProps) {
  const layout = rowLayout(row)

  return (
    <div className="space-y-2 rounded-xl border border-line bg-raised/40 p-3">
      <div className="flex items-center gap-2">
        <TextInput
          className="min-w-0 flex-1"
          value={row.title}
          placeholder="Название сигнала"
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <SelectInput value={row.type} onChange={(event) => onType(event.target.value as SignalValueType)}>
          {typesForGroup(row.group).map((type) => (
            <option key={type} value={type}>
              {TYPE_TITLES[type]}
            </option>
          ))}
        </SelectInput>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg px-2 py-1 text-[12px] text-ink-mute transition hover:bg-sev-crit-soft hover:text-sev-crit"
        >
          Убрать
        </button>
      </div>

      {row.type === 'number' && (
        <div className="grid grid-cols-5 gap-2">
          <TextInput value={row.measure} placeholder="Единица" onChange={(event) => onChange({ measure: event.target.value })} />
          <TextInput value={row.min} placeholder="Мин" onChange={(event) => onChange({ min: event.target.value })} />
          <TextInput value={row.max} placeholder="Макс" onChange={(event) => onChange({ max: event.target.value })} />
          <TextInput value={row.def} placeholder="По умолч." onChange={(event) => onChange({ def: event.target.value })} />
          {row.group !== 'command' && (
            <TextInput
              value={row.alarm}
              placeholder="Авария при"
              title="Значение, которое считается неисправностью"
              onChange={(event) => onChange({ alarm: event.target.value })}
            />
          )}
        </div>
      )}

      {row.type === 'text' && (
        <TextInput className="w-full" value={row.def} placeholder="Значение по умолчанию" onChange={(event) => onChange({ def: event.target.value })} />
      )}

      {(row.type === 'list' || row.type === 'switch') && (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            className="min-w-48 flex-1"
            value={row.values}
            placeholder="Значения через запятую: закрыто, открыто"
            onChange={(event) => onChange({ values: event.target.value })}
          />
          <label className="flex items-center gap-1.5 text-[12px] text-ink-mute">
            по умолчанию
            <SelectInput
              value={layout.some(([key]) => key === row.def) ? row.def : (layout[0]?.[0] ?? '')}
              onChange={(event) => onChange({ def: event.target.value })}
            >
              {layout.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </label>
          {row.group !== 'command' && (
            <label className="flex items-center gap-1.5 text-[12px] text-ink-mute">
              авария при
              <SelectInput value={row.alarm} onChange={(event) => onChange({ alarm: event.target.value })}>
                <option value="">нет</option>
                {layout.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectInput>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
