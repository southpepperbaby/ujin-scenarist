import type { SignalGroup } from '../../api'
import { SelectInput, TextInput } from '../../shared/ui/Fields'
import { BEHAVIOR_KINDS, emptyBehavior, rowLayout, type BehaviorRow, type SignalRow } from './device-type-form'

type BehaviorEditorProps = {
  rows: SignalRow[]
  behaviors: BehaviorRow[]
  onChange: (next: BehaviorRow[]) => void
}

const OPS: { key: BehaviorRow['op']; title: string }[] = [
  { key: 'gt', title: '>' },
  { key: 'gte', title: '≥' },
  { key: 'lt', title: '<' },
  { key: 'lte', title: '≤' },
]

/**
 * Поведение своего типа без кода: что устройство делает само на каждом тике эмулятора.
 * Три вида правил покрывают то, что делают готовые эмуляторы: дрейф, отклик на команду, порог.
 */
export function BehaviorEditor({ rows, behaviors, onChange }: BehaviorEditorProps) {
  const update = (uid: number, patch: Partial<BehaviorRow>) =>
    onChange(behaviors.map((b) => (b.uid === uid ? { ...b, ...patch } : b)))
  const titled = rows.filter((row) => row.title.trim())

  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold">Поведение</h3>
        <span className="text-[12px] text-ink-mute">что устройство делает само, без кнопок песочницы</span>
      </div>

      {behaviors.map((b) => {
        const kind = BEHAVIOR_KINDS.find((item) => item.key === b.type)
        return (
          <div key={b.uid} className="space-y-2 rounded-xl border border-line bg-raised/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium text-ink-dim">{kind?.title}</p>
              <button
                type="button"
                onClick={() => onChange(behaviors.filter((item) => item.uid !== b.uid))}
                className="rounded-lg px-2 py-1 text-[12px] text-ink-mute transition hover:bg-sev-crit-soft hover:text-sev-crit"
              >
                Убрать
              </button>
            </div>

            {b.type === 'drift' && (
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-mute">
                <SignalSelect rows={titled} groups={['property']} numeric value={b.source} onChange={(source) => update(b.uid, { source })} />
                за тик на
                <TextInput className="w-20" value={b.step} placeholder="-0.5" onChange={(e) => update(b.uid, { step: e.target.value })} />
                и шум ±
                <TextInput className="w-20" value={b.noise} placeholder="0" onChange={(e) => update(b.uid, { noise: e.target.value })} />
              </div>
            )}

            {b.type === 'effect' && (
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-mute">
                когда
                <SignalSelect rows={titled} groups={['command', 'setting']} value={b.source} onChange={(source) => update(b.uid, { source })} />
                =
                <ValueInput row={rows.find((row) => row.uid === b.source)} value={b.sourceValue} any onChange={(sourceValue) => update(b.uid, { sourceValue })} />
                через
                <TextInput className="w-16" value={b.delay} placeholder="0" onChange={(e) => update(b.uid, { delay: e.target.value })} />
                тик.
                <SignalSelect rows={titled} groups={['event', 'property']} value={b.target} onChange={(target) => update(b.uid, { target })} />
                =
                <ValueInput row={rows.find((row) => row.uid === b.target)} value={b.targetValue} any anyTitle="как в команде" onChange={(targetValue) => update(b.uid, { targetValue })} />
              </div>
            )}

            {b.type === 'threshold' && (
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-mute">
                если
                <SignalSelect rows={titled} groups={['property']} numeric value={b.source} onChange={(source) => update(b.uid, { source })} />
                <SelectInput value={b.op} onChange={(e) => update(b.uid, { op: e.target.value as BehaviorRow['op'] })}>
                  {OPS.map((op) => (
                    <option key={op.key} value={op.key}>
                      {op.title}
                    </option>
                  ))}
                </SelectInput>
                <TextInput className="w-20" value={b.sourceValue} placeholder="8" onChange={(e) => update(b.uid, { sourceValue: e.target.value })} />
                то
                <SignalSelect rows={titled} groups={['event', 'property']} value={b.target} onChange={(target) => update(b.uid, { target })} />
                =
                <ValueInput row={rows.find((row) => row.uid === b.target)} value={b.targetValue} onChange={(targetValue) => update(b.uid, { targetValue })} />
                иначе
                <ValueInput row={rows.find((row) => row.uid === b.target)} value={b.elseValue} any anyTitle="не трогать" onChange={(elseValue) => update(b.uid, { elseValue })} />
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap gap-3">
        {BEHAVIOR_KINDS.map((kind) => (
          <button
            key={kind.key}
            type="button"
            title={kind.hint}
            onClick={() => onChange([...behaviors, emptyBehavior(kind.key, rows)])}
            className="text-[12px] font-medium text-accent hover:brightness-110"
          >
            + {kind.title.toLowerCase()}
          </button>
        ))}
      </div>
    </section>
  )
}

function SignalSelect({
  rows,
  groups,
  numeric = false,
  value,
  onChange,
}: {
  rows: SignalRow[]
  groups: SignalGroup[]
  numeric?: boolean
  value: number
  onChange: (uid: number) => void
}) {
  const options = rows.filter((row) => groups.includes(row.group) && (!numeric || row.type === 'number'))
  return (
    <SelectInput value={value || ''} onChange={(e) => onChange(Number(e.target.value))}>
      <option value="">сигнал…</option>
      {options.map((row) => (
        <option key={row.uid} value={row.uid}>
          {row.title}
        </option>
      ))}
    </SelectInput>
  )
}

/** Значение под тип сигнала: список выбирается из его значений, число вводится. */
function ValueInput({
  row,
  value,
  any = false,
  anyTitle = 'любое',
  onChange,
}: {
  row: SignalRow | undefined
  value: string
  any?: boolean
  anyTitle?: string
  onChange: (value: string) => void
}) {
  const layout = row ? rowLayout(row) : []
  if (layout.length) {
    return (
      <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{any ? anyTitle : 'значение…'}</option>
        {layout.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </SelectInput>
    )
  }
  return <TextInput className="w-20" value={value} placeholder={any ? anyTitle : ''} onChange={(e) => onChange(e.target.value)} />
}
