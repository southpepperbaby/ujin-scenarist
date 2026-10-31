import { useState, type ReactNode } from 'react'

import {
  api,
  type Action,
  type Condition,
  type Device,
  type Op,
  type Rule,
  type SignalCondition,
  type Trigger,
} from '../../api'
import { OP_TITLE } from '../../shared/rule/rule-lines'
import { Button } from '../../shared/ui/Button'
import { ErrorNote, Field, SelectInput, TextInput } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'
import { Toggle } from '../../shared/ui/Toggle'
import { deviceById, useStore } from '../../store'
import { useCategories } from '../../shared/use-categories'

const OPS = Object.keys(OP_TITLE) as Op[]

export function newRule(devices: Device[]): Rule {
  const first = devices.find((d) => d.scope === 'building') ?? devices[0]
  const signal = first?.signals.find((s) => s.kind !== 'system')
  return {
    id: 'r-' + Math.random().toString(16).slice(2, 10),
    title: 'Новое правило',
    description: '',
    scope: 'building',
    owner: 'uk',
    priority: 100,
    enabled: false,
    status: 'draft',
    cooldown_s: 3,
    trigger: { type: 'signal', device_id: first?.id ?? '', signal: signal?.name ?? '', op: 'eq', value: firstValue(signal) },
    conditions: [],
    actions: [{ type: 'notify', target: 'concierge', level: 'warning', message: 'Сработало правило' }],
  }
}

type SigLike = { layout?: Record<string, string>; value: unknown }

function firstValue(sig?: SigLike) {
  if (sig?.layout) return Number(Object.keys(sig.layout).at(-1))
  return sig?.value ?? 1
}

const isTime = (c: Condition): c is Extract<Condition, { type: 'time' }> => c.type === 'time'

type RuleEditorModalProps = {
  /** Правило для правки или заготовка нового. */
  rule: Rule
  isNew: boolean
  onClose: () => void
}

export function RuleEditorModal({ rule, isNew, onClose }: RuleEditorModalProps) {
  const devices = useStore((state) => state.devices)
  const [r, setR] = useState<Rule>(rule)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const patch = (p: Partial<Rule>) => setR((x) => ({ ...x, ...p }))

  const save = async () => {
    if (!r.title.trim()) return setError('Назовите правило')
    setBusy(true)
    setError('')
    const next = { ...r, title: r.title.trim(), status: r.enabled ? ('active' as const) : r.status }
    try {
      await (isNew ? api.createRule(next) : api.updateRule(next))
      await useStore.getState().reloadRules()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const addCondition = () => {
    const d = devices[0]
    const sig = d?.signals.find((s) => s.kind !== 'system')
    patch({
      conditions: [
        ...r.conditions,
        { type: 'signal', device_id: d?.id ?? '', signal: sig?.name ?? '', op: 'eq', value: firstValue(sig) },
      ],
    })
  }

  return (
    <Modal
      title={isNew ? 'Новое правило' : 'Изменить правило'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="primary" onClick={() => void save()}>
            Сохранить
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <span className="flex-1" />
          <label className="flex items-center gap-2 text-[13px] text-ink-dim">
            Включено
            <Toggle checked={r.enabled} onChange={(enabled) => patch({ enabled })} label="Правило включено" />
          </label>
        </>
      }
    >
      <div className={`space-y-4 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <TextInput
          className="w-full text-[15px] font-semibold"
          value={r.title}
          placeholder="Название правила"
          onChange={(event) => patch({ title: event.target.value })}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Где действует">
            <SelectInput value={r.scope} onChange={(event) => patch({ scope: event.target.value as Rule['scope'] })}>
              <option value="building">дом</option>
              <option value="apartment">квартира</option>
            </SelectInput>
          </Field>
          <Field label="Приоритет" hint="Больше значит важнее">
            <TextInput
              type="number"
              className="w-20"
              value={r.priority}
              onChange={(event) => patch({ priority: Number(event.target.value) })}
            />
          </Field>
        </div>

        <Block label="Когда" hint="событие устройства" bar="bg-accent">
          <SignalPicker
            value={r.trigger}
            devices={devices}
            withOp
            onChange={(v) => patch({ trigger: { ...r.trigger, ...v } as Trigger })}
          />
        </Block>

        <Block label="Если" hint="все условия выполняются в момент события" bar="bg-sev-info">
          {r.conditions.length === 0 && <p className="text-[12px] text-ink-mute">Без условий</p>}
          {r.conditions.map((condition, index) => (
            <Row key={index} onRemove={() => patch({ conditions: r.conditions.filter((_, j) => j !== index) })}>
              {isTime(condition) ? (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-dim">
                  <Chip>время</Chip>с
                  <TextInput
                    type="time"
                    value={condition.start}
                    onChange={(event) =>
                      patch({ conditions: r.conditions.map((x, j) => (j === index ? { ...condition, start: event.target.value } : x)) })
                    }
                  />
                  до
                  <TextInput
                    type="time"
                    value={condition.end}
                    onChange={(event) =>
                      patch({ conditions: r.conditions.map((x, j) => (j === index ? { ...condition, end: event.target.value } : x)) })
                    }
                  />
                </div>
              ) : (
                <SignalPicker
                  value={condition}
                  devices={devices}
                  withOp
                  onChange={(v) =>
                    patch({ conditions: r.conditions.map((x, j) => (j === index ? ({ ...condition, ...v } as SignalCondition) : x)) })
                  }
                />
              )}
            </Row>
          ))}
          <div className="flex gap-1">
            <AddButton onClick={addCondition}>+ условие по датчику</AddButton>
            <AddButton onClick={() => patch({ conditions: [...r.conditions, { type: 'time', start: '22:00', end: '07:00' }] })}>
              + время суток
            </AddButton>
          </div>
        </Block>

        <Block label="То" hint="действия по порядку" bar="bg-ok">
          {r.actions.map((action, index) => (
            <Row
              key={index}
              onRemove={r.actions.length > 1 ? () => patch({ actions: r.actions.filter((_, j) => j !== index) }) : undefined}
            >
              <ActionEditor
                action={action}
                devices={devices}
                onChange={(next) => patch({ actions: r.actions.map((x, j) => (j === index ? next : x)) })}
              />
            </Row>
          ))}
          <div className="flex flex-wrap gap-1">
            <AddButton onClick={() => patch({ actions: [...r.actions, defaultSet(devices)] })}>+ команда устройству</AddButton>
            <AddButton
              onClick={() =>
                patch({ actions: [...r.actions, { type: 'notify', target: 'concierge', level: 'warning', message: '' }] })
              }
            >
              + уведомление
            </AddButton>
            <AddButton onClick={() => patch({ actions: [...r.actions, { type: 'dispatch', category: null, note: '' }] })}>
              + заявка подрядчику
            </AddButton>
          </div>
        </Block>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

function defaultSet(devices: Device[]): Action {
  const d = devices.find((x) => x.signals.some((s) => s.management !== 'r')) ?? devices[0]
  const s = d?.signals.find((x) => x.management !== 'r')
  return { type: 'set_signal', device_id: d?.id ?? '', signal: s?.name ?? '', value: firstValue(s) }
}

function Block({ label, hint, bar, children }: { label: string; hint: string; bar: string; children: ReactNode }) {
  return (
    <div className="relative rounded-xl border border-line bg-raised/40 p-3 pl-5">
      <span className={`absolute bottom-3 left-0 top-3 w-1 rounded-full ${bar}`} />
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-[12px] text-ink-mute">{hint}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 rounded-lg px-2 py-0.5 text-[12px] text-ink-mute transition hover:bg-sev-crit-soft hover:text-sev-crit"
        >
          Убрать
        </button>
      )}
    </div>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-[12px] font-medium text-accent transition hover:bg-accent-soft"
    >
      {children}
    </button>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-field px-2 py-0.5 text-[11px] text-ink-dim">{children}</span>
}

type PickerValue = { device_id: string; signal: string; op?: Op; value: unknown }

function SignalPicker({
  value,
  onChange,
  devices,
  withOp,
  writableOnly,
}: {
  value: PickerValue
  onChange: (v: Partial<PickerValue>) => void
  devices: Device[]
  withOp?: boolean
  writableOnly?: boolean
}) {
  const usable = (d?: Device) => (d?.signals ?? []).filter((s) => s.kind !== 'system' && (!writableOnly || s.management !== 'r'))
  const signals = usable(deviceById(devices, value.device_id))
  const sig = signals.find((s) => s.name === value.signal)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SelectInput
        value={value.device_id}
        onChange={(event) => {
          const first = usable(deviceById(devices, event.target.value))[0]
          onChange({ device_id: event.target.value, signal: first?.name ?? '', value: firstValue(first) })
        }}
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title} · {d.room}
          </option>
        ))}
      </SelectInput>
      <SelectInput
        value={value.signal}
        onChange={(event) =>
          onChange({ signal: event.target.value, value: firstValue(signals.find((s) => s.name === event.target.value)) })
        }
      >
        {signals.map((s) => (
          <option key={s.name} value={s.name}>
            {s.title}
          </option>
        ))}
      </SelectInput>
      {withOp && (
        <SelectInput value={value.op} onChange={(event) => onChange({ op: event.target.value as Op })}>
          {OPS.map((op) => (
            <option key={op} value={op}>
              {OP_TITLE[op]}
            </option>
          ))}
        </SelectInput>
      )}
      {value.op !== 'changed' &&
        (sig?.layout ? (
          <SelectInput value={String(value.value)} onChange={(event) => onChange({ value: Number(event.target.value) })}>
            {Object.entries(sig.layout).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </SelectInput>
        ) : (
          <TextInput
            className="w-24"
            value={String(value.value ?? '')}
            placeholder={sig?.measure ?? 'значение'}
            onChange={(event) => {
              const n = Number(event.target.value)
              onChange({ value: event.target.value === '' || Number.isNaN(n) ? event.target.value : n })
            }}
          />
        ))}
      {sig?.measure && !sig.layout && <span className="text-[12px] text-ink-mute">{sig.measure}</span>}
    </div>
  )
}

function ActionEditor({ action, devices, onChange }: { action: Action; devices: Device[]; onChange: (a: Action) => void }) {
  const categories = useCategories()
  const delay = (
    <label className="flex items-center gap-1 text-[12px] text-ink-mute">
      через
      <TextInput
        type="number"
        className="w-14"
        value={action.delay_s ?? 0}
        onChange={(event) => onChange({ ...action, delay_s: Number(event.target.value) })}
      />
      с
    </label>
  )

  if (action.type === 'set_signal') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Chip>команда</Chip>
        <SignalPicker value={action} devices={devices} writableOnly onChange={(v) => onChange({ ...action, ...v } as Action)} />
        {delay}
      </div>
    )
  }

  if (action.type === 'notify') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Chip>уведомить</Chip>
        <SelectInput
          value={action.target}
          onChange={(event) => onChange({ ...action, target: event.target.value as 'resident' | 'concierge' })}
        >
          <option value="resident">жителя</option>
          <option value="concierge">консьержа</option>
        </SelectInput>
        <SelectInput
          value={action.level}
          onChange={(event) => onChange({ ...action, level: event.target.value as 'info' | 'warning' | 'critical' })}
        >
          <option value="info">инфо</option>
          <option value="warning">важно</option>
          <option value="critical">критично</option>
        </SelectInput>
        <TextInput
          className="min-w-48 flex-1"
          value={action.message}
          placeholder="Текст уведомления"
          onChange={(event) => onChange({ ...action, message: event.target.value })}
        />
        {delay}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip>заявка</Chip>
      <SelectInput value={action.category ?? ''} onChange={(event) => onChange({ ...action, category: event.target.value || null })}>
        <option value="">категорию определит ИИ</option>
        {Object.entries(categories).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </SelectInput>
      <TextInput
        className="min-w-48 flex-1"
        value={action.note ?? ''}
        placeholder="Комментарий подрядчику"
        onChange={(event) => onChange({ ...action, note: event.target.value })}
      />
      {delay}
    </div>
  )
}
