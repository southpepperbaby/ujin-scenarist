import { useMemo, useState } from 'react'
import { api, type Device, type SignalDecl } from './api'
import { guard, useStore } from './store'
import { Badge, Button, cx, Dot, FAMILY_ICON, GROUPS, Input, Modal, SectionTitle, Select } from './ui'

const INPUT_TITLES: Record<string, [string, string]> = {
  wet: ['Намочить', 'Высушить'],
  smoke: ['Задымить', 'Проветрить'],
  obstacle: ['Предмет под стрелой', 'Убрать предмет'],
  fault: ['Сломать датчик', 'Починить'],
  jam: ['Заклинить привод', 'Починить привод'],
}

const INPUT_ON_VALUE: Record<string, unknown> = { smoke: 90 }

export function DeviceList({ scope, onOpen }: { scope?: 'apartment' | 'building'; onOpen: (d: Device) => void }) {
  const devices = useStore((s) => s.devices)
  const [creating, setCreating] = useState(false)
  const shown = scope ? devices.filter((d) => d.scope === scope) : devices
  const rooms = useMemo(() => {
    const m = new Map<string, Device[]>()
    for (const d of shown) {
      const key = d.scope === 'building' ? `Дом · ${d.room}` : d.room || 'Без комнаты'
      m.set(key, [...(m.get(key) ?? []), d])
    }
    return [...m.entries()]
  }, [shown])

  return (
    <div>
      <SectionTitle
        right={
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            + Устройство
          </Button>
        }
      >
        Устройства
      </SectionTitle>
      <div className="space-y-4">
        {rooms.map(([room, list]) => (
          <div key={room}>
            <div className="mb-1.5 text-xs font-medium text-slate-400">{room}</div>
            <div className="space-y-1.5">
              {list.map((d) => (
                <DeviceRow key={d.id} d={d} onOpen={() => onOpen(d)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <DeviceCreator open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function DeviceRow({ d, onOpen }: { d: Device; onOpen: () => void }) {
  const key = keySignal(d)
  const alarm = isAlarm(d)
  return (
    <button
      onClick={onOpen}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition hover:ring-indigo-300',
        alarm ? 'bg-rose-50 ring-rose-200' : 'bg-white ring-slate-200',
        !d.online && 'opacity-60',
      )}
    >
      <span className="text-xl">{FAMILY_ICON[d.family] ?? '🔌'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{d.title}</span>
        <span className="block truncate text-xs text-slate-500">{key}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <Dot on={d.online} />
        {d.ujin && <span className="text-[10px] font-semibold text-emerald-600">UJIN</span>}
      </span>
    </button>
  )
}

const KEY_SIGNAL: Record<string, string> = {
  leak: 'leak',
  valve: 'state',
  counter: 'total',
  light: 'lamp',
  thermostat: 'temperature',
  fire: 'alarm',
  barrier: 'state',
  elevator: 'floor_current',
  ventilation: 'co2',
}

export function keySignal(d: Device) {
  const sig = d.signals.find((s) => s.name === KEY_SIGNAL[d.family]) ?? d.signals.find((s) => s.group === 'property')
  if (!sig) return ''
  return `${sig.title}: ${showValue(sig)}`
}

export function isAlarm(d: Device) {
  const get = (n: string) => d.signals.find((s) => s.name === n)?.value
  return (d.family === 'leak' && get('leak') === 1) || (d.family === 'fire' && get('alarm') === 1) || (d.family === 'valve' && get('jammed') === 1)
}

export function showValue(s: Pick<SignalDecl, 'value' | 'layout' | 'measure'>) {
  if (s.layout?.[String(s.value)]) return s.layout[String(s.value)]
  const v = typeof s.value === 'number' ? +s.value.toFixed(2) : s.value
  return `${v}${s.measure ? ' ' + s.measure : ''}`
}

export function DeviceDetail({ device, onClose }: { device: Device | null; onClose: () => void }) {
  const live = useStore((s) => s.devices.find((d) => d.id === device?.id))
  const [editing, setEditing] = useState(false)
  if (!device || !live) return null
  const d = live
  return (
    <Modal open onClose={onClose} title={`${FAMILY_ICON[d.family] ?? ''} ${d.title}`} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={d.online ? 'green' : 'red'}>
          <Dot on={d.online} /> {d.online ? 'на связи' : 'нет связи'}
        </Badge>
        <Badge>{d.scope === 'building' ? 'общедомовое' : 'квартира'}</Badge>
        <Badge>{d.room}</Badge>
        <Badge tone="violet">{d.model}</Badge>
        {d.ujin ? <Badge tone="green">Ujin sn {d.ujin.sn}</Badge> : <Badge>только эмулятор</Badge>}
        <span className="flex-1" />
        <Button size="sm" onClick={() => guard(api.patchDevice(d.id, { online: !d.online }))}>
          {d.online ? 'Отключить связь' : 'Вернуть связь'}
        </Button>
        <Button size="sm" onClick={() => setEditing((v) => !v)}>
          Изменить
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            await guard(api.deleteDevice(d.id))
            onClose()
          }}
        >
          Удалить
        </Button>
      </div>

      {editing && <DeviceMetaForm d={d} onDone={() => setEditing(false)} />}

      {d.inputs.length > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="mb-2 text-xs font-semibold text-amber-800">Физический мир (эмулятор)</div>
          <div className="flex flex-wrap gap-2">
            {d.inputs.map((inp) => {
              const [on, off] = INPUT_TITLES[inp] ?? [inp + ' ▲', inp + ' ▼']
              return (
                <span key={inp} className="flex gap-1">
                  <Button size="sm" onClick={() => guard(api.inject(d.id, inp, INPUT_ON_VALUE[inp] ?? 1))}>
                    {on}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => guard(api.inject(d.id, inp, 0))}>
                    {off}
                  </Button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => {
          const rows = d.signals.filter((s) => s.group === g.key)
          if (!rows.length) return null
          return (
            <div key={g.key}>
              <div className="mb-1 text-sm font-semibold">
                {g.title} <span className="font-normal text-slate-400">· {g.hint}</span>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {rows.map((s) => (
                  <SignalLine key={s.name} d={d} s={s} />
                ))}
              </div>
            </div>
          )
        })}
        <div>
          <div className="mb-1 text-sm font-semibold">
            События <span className="font-normal text-slate-400">· можно использовать как триггер</span>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl p-2 ring-1 ring-slate-200">
            {d.events.map((e) => (
              <Badge key={e.id} tone="blue">
                {e.title}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function DeviceMetaForm({ d, onDone }: { d: Device; onDone: () => void }) {
  const [title, setTitle] = useState(d.title)
  const [room, setRoom] = useState(d.room)
  const [scope, setScope] = useState(d.scope)
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
      <label className="text-xs text-slate-500">
        Название
        <Input className="block w-56" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="text-xs text-slate-500">
        Помещение
        <Input className="block w-40" value={room} onChange={(e) => setRoom(e.target.value)} />
      </label>
      <label className="text-xs text-slate-500">
        Уровень
        <Select className="block" value={scope} onChange={(e) => setScope(e.target.value as Device['scope'])}>
          <option value="apartment">квартира</option>
          <option value="building">дом</option>
        </Select>
      </label>
      <Button
        variant="primary"
        onClick={async () => {
          await guard(api.patchDevice(d.id, { title, room, scope }))
          onDone()
        }}
      >
        Сохранить
      </Button>
    </div>
  )
}

function SignalLine({ d, s }: { d: Device; s: SignalDecl }) {
  const writable = s.management !== 'r'
  const send = (v: unknown) => guard(api.command(d.id, s.name, v))
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate">{s.title}</span>
        <span className="block font-mono text-[10px] text-slate-400">
          {s.name} · {s.control} · {s.management}
          {s.min !== undefined && s.max !== undefined && ` · ${s.min}…${s.max}`}
        </span>
      </span>
      {writable && s.layout && Object.keys(s.layout).length <= 4 ? (
        <span className="flex shrink-0 gap-1">
          {Object.entries(s.layout).map(([v, label]) => (
            <Button key={v} size="sm" variant={String(s.value) === v ? 'primary' : 'soft'} onClick={() => send(Number(v))}>
              {label}
            </Button>
          ))}
        </span>
      ) : writable && (s.control === 'push_time' || s.control === 'button') ? (
        <Button size="sm" onClick={() => send(1)}>
          Нажать
        </Button>
      ) : writable && s.control === 'switch' ? (
        <Button size="sm" variant={s.value ? 'primary' : 'soft'} onClick={() => send(s.value ? 0 : 1)}>
          {s.value ? 'вкл' : 'выкл'}
        </Button>
      ) : writable ? (
        <Input
          className="w-24 text-right"
          defaultValue={String(s.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(Number((e.target as HTMLInputElement).value))
          }}
        />
      ) : (
        <span className="shrink-0 font-mono text-slate-700">{showValue(s)}</span>
      )}
    </div>
  )
}

function DeviceCreator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const families = useStore((s) => s.families)
  const [family, setFamily] = useState('valve')
  const [title, setTitle] = useState('')
  const [room, setRoom] = useState('')
  const [scope, setScope] = useState<'apartment' | 'building'>('apartment')
  const f = families.find((x) => x.family === family)
  return (
    <Modal open={open} onClose={onClose} title="Конструктор устройства" wide>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {families.map((x) => (
            <button
              key={x.family}
              onClick={() => setFamily(x.family)}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                x.family === family ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50',
              )}
            >
              <span>{FAMILY_ICON[x.family] ?? '🔌'}</span> {x.title}
            </button>
          ))}
        </div>
        <div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Input placeholder={f?.title ?? 'Название'} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Помещение" value={room} onChange={(e) => setRoom(e.target.value)} />
            <Select value={scope} onChange={(e) => setScope(e.target.value as 'apartment' | 'building')}>
              <option value="apartment">квартира</option>
              <option value="building">дом</option>
            </Select>
          </div>
          {f && (
            <>
              <div className="mb-2 text-xs text-slate-500">
                Декларация модели <span className="font-mono">{f.model}</span>: единый формат сигналов Ujin
              </div>
              <div className="space-y-3">
                {GROUPS.map((g) => {
                  const rows = f.declaration.filter((s) => s.group === g.key)
                  if (!rows.length) return null
                  return (
                    <div key={g.key}>
                      <div className="text-xs font-semibold text-slate-600">{g.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {rows.map((s) => (
                          <Badge key={s.name}>
                            {s.title} <span className="font-mono text-slate-400">{s.name}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )
                })}
                <div>
                  <div className="text-xs font-semibold text-slate-600">События</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {f.events.map((e) => (
                      <Badge key={e.id} tone="blue">
                        {e.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="mt-5 flex justify-end">
            <Button
              variant="primary"
              onClick={async () => {
                const ok = await guard(api.createDevice({ family, title: title || undefined, room, scope }))
                if (ok) {
                  setTitle('')
                  setRoom('')
                  onClose()
                }
              }}
            >
              Добавить и запустить эмулятор
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
