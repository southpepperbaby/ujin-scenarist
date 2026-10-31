import { useState } from 'react'

import { api, type Family, type SignalGroup, type SignalValueType } from '../../api'
import { toastOk } from '../../shared/toast'
import { Button } from '../../shared/ui/Button'
import { RemoveButton } from '../../shared/ui/DeleteButtons'
import { ErrorNote, Field, SelectInput, TextInput } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'
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

/** Конструктор своего типа устройства: сигналы по группам и поведение эмулятора. */
type TypeEditorProps = {
  family: Family | null
  families: Family[]
  onClose: () => void
  onBack: () => void
  /** Тип сохранён на сервере: дальше обновление списка, его сбой к сохранению не относится. */
  onSaved: () => void
}

export function TypeEditor({ family, families, onClose, onBack, onSaved }: TypeEditorProps) {
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
  // Создали, но окно ещё открыто: повторное «Сохранить» обновляет созданный тип, а не плодит новый.
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const update = (uid: number, patch: Partial<SignalRow>) => {
    setDirty(true)
    setRows((list) => list.map((row) => (row.uid === uid ? { ...row, ...patch } : row)))
  }

  const changeType = (row: SignalRow, type: SignalValueType) => {
    const values = type === 'switch' ? 'выкл, вкл' : type === 'list' && !row.values ? 'норма, сработало' : row.values
    update(row.uid, { type, values, def: type === 'switch' ? '0' : '', alarm: '' })
  }

  const save = async () => {
    if (busy) return
    const problem = validate(title, rows) || validateBehaviors(behaviors, rows)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    const existing = family?.family ?? createdCode
    try {
      if (existing) {
        await api.updateType(buildSpec(existing, title, rows, behaviors))
      } else {
        const code = familyCode(title, new Set(families.map((item) => item.family)))
        await api.createType(buildSpec(code, title, rows, behaviors))
        setCreatedCode(code)
      }
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      return
    }
    toastOk(`Тип «${title.trim()}» сохранён`)
    onSaved()
  }

  return (
    <Modal
      title={family ? `Тип: ${family.title}` : 'Новый тип устройства'}
      onClose={onClose}
      dirty={dirty}
      wide
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} busy={busy}>
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
            autoFocus
            onChange={(event) => {
              setTitle(event.target.value)
              setDirty(true)
            }}
          />
        </Field>

        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.group === group.key)
          return (
            <section key={group.key} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-body font-semibold">{group.title}</h3>
                <span className="text-meta text-ink-mute">{group.hint}</span>
              </div>
              {groupRows.map((row) => (
                <SignalEditor
                  key={row.uid}
                  row={row}
                  onChange={(patch) => update(row.uid, patch)}
                  onType={(type) => changeType(row, type)}
                  onRemove={() => {
                    setDirty(true)
                    setRows((list) => list.filter((item) => item.uid !== row.uid))
                  }}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  setDirty(true)
                  setRows((list) => [...list, emptyRow(group.key as SignalGroup)])
                }}
                className="text-meta font-medium text-accent hover:brightness-110"
              >
                + добавить сигнал
              </button>
            </section>
          )
        })}

        <BehaviorEditor
          rows={rows}
          behaviors={behaviors}
          onChange={(next) => {
            setDirty(true)
            setBehaviors(next)
          }}
        />

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
          placeholder="Название сигнала" aria-label="Название сигнала"
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <SelectInput aria-label="Тип значения" value={row.type} onChange={(event) => onType(event.target.value as SignalValueType)}>
          {typesForGroup(row.group).map((type) => (
            <option key={type} value={type}>
              {TYPE_TITLES[type]}
            </option>
          ))}
        </SelectInput>
        <RemoveButton onClick={onRemove} label={`Убрать сигнал «${row.title || 'без названия'}»`} />
      </div>

      {row.type === 'number' && (
        <div className="grid grid-cols-5 gap-2">
          <TextInput value={row.measure} placeholder="Единица" aria-label="Единица измерения" onChange={(event) => onChange({ measure: event.target.value })} />
          <TextInput value={row.min} placeholder="Мин" aria-label="Минимум" onChange={(event) => onChange({ min: event.target.value })} />
          <TextInput value={row.max} placeholder="Макс" aria-label="Максимум" onChange={(event) => onChange({ max: event.target.value })} />
          <TextInput value={row.def} placeholder="По умолч." aria-label="Значение по умолчанию" onChange={(event) => onChange({ def: event.target.value })} />
          {row.group !== 'command' && (
            <TextInput
              value={row.alarm}
              placeholder="Авария при" aria-label="Значение аварии"
              title="Значение, которое считается неисправностью"
              onChange={(event) => onChange({ alarm: event.target.value })}
            />
          )}
        </div>
      )}

      {row.type === 'text' && (
        <TextInput className="w-full" value={row.def} placeholder="Значение по умолчанию" aria-label="Значение по умолчанию" onChange={(event) => onChange({ def: event.target.value })} />
      )}

      {(row.type === 'list' || row.type === 'switch') && (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            className="min-w-48 flex-1"
            value={row.values}
            placeholder="Значения через запятую: закрыто, открыто"
            aria-label="Значения через запятую"
            onChange={(event) => onChange({ values: event.target.value })}
          />
          <label className="flex items-center gap-1.5 text-meta text-ink-mute">
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
            <label className="flex items-center gap-1.5 text-meta text-ink-mute">
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
