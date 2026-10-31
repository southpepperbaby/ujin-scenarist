import { useEffect, useState } from 'react'
import { api, type Action, type Condition, type Device, type Op, type Rule, type Trigger } from './api'
import { deviceById, guard, signalTitle, useStore, valueLabel } from './store'
import { Badge, Button, Card, cx, FAMILY_ICON, Input, Modal, SectionTitle, Select } from './ui'

const OPS: { op: Op; title: string }[] = [
  { op: 'eq', title: '=' },
  { op: 'ne', title: '≠' },
  { op: 'gt', title: '>' },
  { op: 'gte', title: '≥' },
  { op: 'lt', title: '<' },
  { op: 'lte', title: '≤' },
  { op: 'changed', title: 'изменился' },
]
const OP_TITLE = Object.fromEntries(OPS.map((o) => [o.op, o.title]))

const STATUS: Record<Rule['status'], { title: string; tone: 'gray' | 'blue' | 'violet' | 'green' }> = {
  draft: { title: 'черновик', tone: 'gray' },
  checked: { title: 'проверено', tone: 'blue' },
  tested: { title: 'прогнано', tone: 'violet' },
  active: { title: 'включено', tone: 'green' },
}

export function describeRule(r: Rule, devices: Device[]) {
  const t = r.trigger
  const dev = deviceById(devices, t.device_id)
  const when = `${dev?.title ?? t.device_id}: ${signalTitle(devices, t.device_id, t.signal)} ${
    t.op === 'changed' ? 'изменился' : `${OP_TITLE[t.op]} ${valueLabel(devices, t.device_id, t.signal, t.value)}`
  }`
  const acts = r.actions.map((a) => {
    if (a.type === 'set_signal')
      return `${deviceById(devices, a.device_id)?.title ?? a.device_id} → ${signalTitle(devices, a.device_id, a.signal)}: ${valueLabel(devices, a.device_id, a.signal, a.value)}`
    if (a.type === 'notify') return a.target === 'concierge' ? 'сигнал консьержу' : 'уведомление жителю'
    return 'заявка подрядчику'
  })
  return { when, acts }
}

export function RuleList({ selected, onSelect, filter }: { selected?: string; onSelect: (r: Rule) => void; filter?: (r: Rule) => boolean }) {
  const rules = useStore((s) => s.rules)
  const devices = useStore((s) => s.devices)
  const events = useStore((s) => s.events)
  const shown = filter ? rules.filter(filter) : rules
  const lastFire = (id: string) => [...events].reverse().find((e) => e.kind === 'rule' && e.rule_id === id && e.phase !== 'running')
  return (
    <div className="space-y-2">
      {shown.map((r) => {
        const { when, acts } = describeRule(r, devices)
        const fire = lastFire(r.id)
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className={cx(
              'block w-full rounded-xl p-3 text-left ring-1 ring-inset transition',
              selected === r.id ? 'bg-indigo-50/60 ring-indigo-300' : 'bg-white ring-slate-200 hover:ring-indigo-200',
              !r.enabled && 'opacity-60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold">{r.title}</span>
              <span className="flex shrink-0 gap-1">
                {r.owner === 'uk' && <Badge tone="amber">УК · приоритет {r.priority}</Badge>}
                <Badge tone={r.enabled ? STATUS[r.status].tone : 'gray'}>{r.enabled ? STATUS[r.status].title : 'выключено'}</Badge>
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              <b className="font-medium text-slate-600">Когда</b> {when}
            </div>
            <div className="text-xs text-slate-500">
              <b className="font-medium text-slate-600">То</b> {acts.join(' · ')}
            </div>
            {fire && (
              <div
                className={cx(
                  'mt-1.5 text-[11px]',
                  fire.phase === 'ok' ? 'text-emerald-600' : fire.phase === 'skipped' ? 'text-slate-400' : 'text-rose-600',
                )}
              >
                {new Date(fire.ts * 1000).toLocaleTimeString('ru-RU')} · {fire.message}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function newRule(devices: Device[]): Rule {
  const leak = devices.find((d) => d.family === 'leak') ?? devices[0]
  return {
    id: 'r-' + Math.random().toString(16).slice(2, 10),
    title: 'Новое правило',
    description: '',
    scope: 'apartment',
    owner: 'resident',
    priority: 50,
    enabled: false,
    status: 'draft',
    cooldown_s: 3,
    trigger: { type: 'signal', device_id: leak?.id ?? '', signal: 'leak', op: 'eq', value: 1 },
    conditions: [],
    actions: [{ type: 'notify', target: 'resident', level: 'info', message: 'Сработало правило' }],
  }
}

export function RuleEditor({ rule, isNew, onSaved, onDeleted }: { rule: Rule; isNew: boolean; onSaved: (r: Rule) => void; onDeleted: () => void }) {
  const devices = useStore((s) => s.devices)
  const reloadRules = useStore((s) => s.reloadRules)
  const [r, setR] = useState<Rule>(rule)
  const [exported, setExported] = useState<Record<string, unknown> | null>(null)
  useEffect(() => setR(rule), [rule])
  const patch = (p: Partial<Rule>) => setR((x) => ({ ...x, ...p }))

  const save = async (extra: Partial<Rule> = {}) => {
    const next = { ...r, ...extra }
    const out = await guard(isNew ? api.createRule(next) : api.updateRule(next))
    if (out) {
      await reloadRules()
      onSaved(out)
    }
  }

  return (
    <Card className="p-5">
      <Input className="mb-2 w-full text-base font-semibold" value={r.title} onChange={(e) => patch({ title: e.target.value })} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={r.owner} onChange={(e) => patch({ owner: e.target.value as Rule['owner'], priority: e.target.value === 'uk' ? 100 : 50 })}>
          <option value="resident">правило жителя</option>
          <option value="uk">правило УК</option>
        </Select>
        <Select value={r.scope} onChange={(e) => patch({ scope: e.target.value as Rule['scope'] })}>
          <option value="apartment">квартира</option>
          <option value="building">дом</option>
        </Select>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          приоритет
          <Input type="number" className="w-16" value={r.priority} onChange={(e) => patch({ priority: Number(e.target.value) })} />
        </label>
      </div>

      <Block label="Когда" tone="indigo" hint="событие устройства">
        <SignalPicker value={r.trigger} onChange={(v) => patch({ trigger: { ...r.trigger, ...v } as Trigger })} devices={devices} withOp />
      </Block>

      <Block label="Если" tone="slate" hint="все условия выполняются в момент события">
        {r.conditions.length === 0 && <div className="text-xs text-slate-400">Без условий</div>}
        {r.conditions.map((c, i) => (
          <Row key={i} onRemove={() => patch({ conditions: r.conditions.filter((_, j) => j !== i) })}>
            <SignalPicker
              value={c}
              devices={devices}
              withOp
              onChange={(v) => patch({ conditions: r.conditions.map((x, j) => (j === i ? ({ ...x, ...v } as Condition) : x)) })}
            />
          </Row>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => patch({ conditions: [...r.conditions, { device_id: devices[0]?.id ?? '', signal: devices[0]?.signals[1]?.name ?? '', op: 'eq', value: 1 }] })}
        >
          + условие
        </Button>
      </Block>

      <Block label="То" tone="emerald" hint="действия по порядку">
        {r.actions.map((a, i) => (
          <Row key={i} onRemove={r.actions.length > 1 ? () => patch({ actions: r.actions.filter((_, j) => j !== i) }) : undefined}>
            <ActionEditor a={a} devices={devices} onChange={(na) => patch({ actions: r.actions.map((x, j) => (j === i ? na : x)) })} />
          </Row>
        ))}
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => patch({ actions: [...r.actions, defaultSet(devices)] })}>
            + команда устройству
          </Button>
          <Button size="sm" variant="ghost" onClick={() => patch({ actions: [...r.actions, { type: 'notify', target: 'concierge', level: 'warning', message: '' }] })}>
            + уведомление
          </Button>
          <Button size="sm" variant="ghost" onClick={() => patch({ actions: [...r.actions, { type: 'dispatch', category: null, note: '' }] })}>
            + заявка подрядчику
          </Button>
        </div>
      </Block>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <Button variant="primary" onClick={() => save()}>
          Сохранить
        </Button>
        <Button onClick={() => save({ enabled: !r.enabled, status: !r.enabled ? 'active' : r.status })}>{r.enabled ? 'Выключить' : 'Включить'}</Button>
        {!isNew && (
          <>
            <Button onClick={() => guard(api.runRule(r.id))}>▶ Выполнить сейчас</Button>
            <Button onClick={async () => setExported((await guard(api.exportRule(r.id))) ?? null)}>Экспорт в Ujin</Button>
            <span className="flex-1" />
            <Button
              variant="danger"
              onClick={async () => {
                await guard(api.deleteRule(r.id))
                await reloadRules()
                onDeleted()
              }}
            >
              Удалить
            </Button>
          </>
        )}
      </div>

      <Modal open={!!exported} onClose={() => setExported(null)} title="Правило в формате Ujin autoscripts">
        <p className="mb-3 text-sm text-slate-500">
          Строки для <span className="font-mono">autoscripts/edit</span>. То, что платформа не умеет выразить, исполняет наш движок.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(exported, null, 2)}</pre>
      </Modal>
    </Card>
  )
}

function defaultSet(devices: Device[]): Action {
  const d = devices.find((x) => x.signals.some((s) => s.management !== 'r')) ?? devices[0]
  const s = d?.signals.find((x) => x.management !== 'r')
  return { type: 'set_signal', device_id: d?.id ?? '', signal: s?.name ?? '', value: 1 }
}

function Block({ label, hint, tone, children }: { label: string; hint: string; tone: 'indigo' | 'slate' | 'emerald'; children: React.ReactNode }) {
  const bar = { indigo: 'bg-indigo-500', slate: 'bg-slate-400', emerald: 'bg-emerald-500' }[tone]
  return (
    <div className="relative mb-3 rounded-xl bg-slate-50/70 p-3 pl-5">
      <span className={cx('absolute left-0 top-3 bottom-3 w-1 rounded-full', bar)} />
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-xs text-slate-400">{hint}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">{children}</div>
      {onRemove && (
        <button className="mt-1.5 text-slate-300 hover:text-rose-500" onClick={onRemove} title="Убрать">
          ✕
        </button>
      )}
    </div>
  )
}

function SignalPicker({
  value,
  onChange,
  devices,
  withOp,
  writableOnly,
}: {
  value: { device_id: string; signal: string; op?: Op; value: unknown }
  onChange: (v: { device_id?: string; signal?: string; op?: Op; value?: unknown }) => void
  devices: Device[]
  withOp?: boolean
  writableOnly?: boolean
}) {
  const dev = deviceById(devices, value.device_id)
  const signals = (dev?.signals ?? []).filter((s) => s.kind !== 'system' && (!writableOnly || s.management !== 'r'))
  const sig = signals.find((s) => s.name === value.signal)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={value.device_id}
        onChange={(e) => {
          const nd = deviceById(devices, e.target.value)
          const first = nd?.signals.find((s) => s.kind !== 'system' && (!writableOnly || s.management !== 'r'))
          onChange({ device_id: e.target.value, signal: first?.name ?? '', value: firstValue(first) })
        }}
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {FAMILY_ICON[d.family] ?? ''} {d.title} · {d.room}
          </option>
        ))}
      </Select>
      <Select value={value.signal} onChange={(e) => onChange({ signal: e.target.value, value: firstValue(signals.find((s) => s.name === e.target.value)) })}>
        {signals.map((s) => (
          <option key={s.name} value={s.name}>
            {s.title}
          </option>
        ))}
      </Select>
      {withOp && (
        <Select value={value.op} onChange={(e) => onChange({ op: e.target.value as Op })}>
          {OPS.map((o) => (
            <option key={o.op} value={o.op}>
              {o.title}
            </option>
          ))}
        </Select>
      )}
      {value.op !== 'changed' &&
        (sig?.layout ? (
          <Select value={String(value.value)} onChange={(e) => onChange({ value: Number(e.target.value) })}>
            {Object.entries(sig.layout).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            className="w-24"
            value={String(value.value ?? '')}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ value: e.target.value === '' || isNaN(n) ? e.target.value : n })
            }}
            placeholder={sig?.measure ?? 'значение'}
          />
        ))}
      {sig?.measure && !sig.layout && <span className="text-xs text-slate-400">{sig.measure}</span>}
    </div>
  )
}

function firstValue(s?: { layout?: Record<string, string>; value: unknown }) {
  if (s?.layout) return Number(Object.keys(s.layout).at(-1))
  return s?.value ?? 1
}

function ActionEditor({ a, devices, onChange }: { a: Action; devices: Device[]; onChange: (a: Action) => void }) {
  const delay = (
    <label className="flex items-center gap-1 text-xs text-slate-400">
      через
      <Input type="number" className="w-14" value={a.delay_s ?? 0} onChange={(e) => onChange({ ...a, delay_s: Number(e.target.value) })} />с
    </label>
  )
  if (a.type === 'set_signal')
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="violet">команда</Badge>
        <SignalPicker value={a} devices={devices} writableOnly onChange={(v) => onChange({ ...a, ...v } as Action)} />
        {delay}
      </div>
    )
  if (a.type === 'notify')
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">уведомить</Badge>
        <Select value={a.target} onChange={(e) => onChange({ ...a, target: e.target.value as 'resident' | 'concierge' })}>
          <option value="resident">жителя</option>
          <option value="concierge">консьержа</option>
        </Select>
        <Select value={a.level} onChange={(e) => onChange({ ...a, level: e.target.value as 'info' | 'warning' | 'critical' })}>
          <option value="info">инфо</option>
          <option value="warning">важно</option>
          <option value="critical">критично</option>
        </Select>
        <Input className="min-w-48 flex-1" value={a.message} placeholder="Текст уведомления" onChange={(e) => onChange({ ...a, message: e.target.value })} />
        {delay}
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="amber">заявка</Badge>
      <Select value={a.category ?? ''} onChange={(e) => onChange({ ...a, category: e.target.value || null })}>
        <option value="">категорию определит ИИ</option>
        <option value="plumbing">сантехника</option>
        <option value="electric">электрика</option>
        <option value="access">ворота и СКУД</option>
        <option value="lift">лифт</option>
        <option value="fire">пожарная безопасность</option>
      </Select>
      <Input className="min-w-48 flex-1" value={a.note ?? ''} placeholder="Комментарий подрядчику" onChange={(e) => onChange({ ...a, note: e.target.value })} />
      {delay}
    </div>
  )
}

export function RulesSection({ filter, owner }: { filter?: (r: Rule) => boolean; owner?: Rule['owner'] }) {
  const devices = useStore((s) => s.devices)
  const rules = useStore((s) => s.rules)
  const [sel, setSel] = useState<Rule | null>(null)
  const [isNew, setIsNew] = useState(false)
  useEffect(() => {
    if (!sel && rules.length) setSel(rules.find((r) => !filter || filter(r)) ?? null)
  }, [rules, sel, filter])
  return (
    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
      <div>
        <SectionTitle
          right={
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const r = newRule(devices)
                if (owner === 'uk') Object.assign(r, { owner: 'uk', scope: 'building', priority: 100 })
                setSel(r)
                setIsNew(true)
              }}
            >
              + Правило
            </Button>
          }
        >
          Сценарии
        </SectionTitle>
        <RuleList
          selected={sel?.id}
          filter={filter}
          onSelect={(r) => {
            setSel(r)
            setIsNew(false)
          }}
        />
      </div>
      <div className="min-w-0">
        {sel && (
          <RuleEditor
            rule={sel}
            isNew={isNew}
            onSaved={(r) => {
              setSel(r)
              setIsNew(false)
            }}
            onDeleted={() => setSel(null)}
          />
        )}
      </div>
    </div>
  )
}
