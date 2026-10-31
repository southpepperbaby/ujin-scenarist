import { useState } from 'react'
import { api, type BusEvent, type Device, type Notification } from './api'
import { DeviceDetail, DeviceList, isAlarm, keySignal } from './devices'
import { RuleFromText } from './nl'
import { describeRule, RulesSection } from './rules'
import { guard, useStore } from './store'
import { Badge, Button, Card, cx, Dot, FAMILY_ICON, SectionTitle, timeOf } from './ui'

const NOISY = new Set(['battery', 'energy_kwh', 'total', 'kvh_t1', 'kvh_t2', 'kvh_t3', 'humidity', 'power_w', 'cycles', 'supply_temp', 'pm25', 'co2'])

export function EventFeed({ compact }: { compact?: boolean }) {
  const events = useStore((s) => s.events)
  const devices = useStore((s) => s.devices)
  const [all, setAll] = useState(false)
  const shown = events.filter((e) => {
    if (e.kind === 'log') return all
    if (e.kind === 'signal') return all || (!NOISY.has(e.signal ?? '') && e.source !== 'tick') || isImportant(e)
    if (e.kind === 'rule') return e.phase !== 'running' || all
    return true
  })
  return (
    <div>
      <SectionTitle
        right={
          <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setAll((v) => !v)}>
            {all ? 'только важное' : 'все события'}
          </button>
        }
      >
        Лента
      </SectionTitle>
      <ol className={cx('space-y-1', compact ? 'max-h-80' : 'max-h-[calc(100vh-220px)]', 'overflow-y-auto pr-1')}>
        {[...shown].reverse().slice(0, 200).map((e) => (
          <FeedItem key={e.seq} e={e} devices={devices} />
        ))}
      </ol>
    </div>
  )
}

function isImportant(e: BusEvent) {
  return ['leak', 'alarm', 'state', 'valve', 'lamp', 'jammed', 'floor_current', 'open_cmd'].includes(e.signal ?? '')
}

function FeedItem({ e, devices }: { e: BusEvent; devices: Device[] }) {
  const dev = devices.find((d) => d.id === e.device_id)
  const time = <span className="shrink-0 font-mono text-[10px] text-slate-400">{timeOf(e.ts)}</span>
  if (e.kind === 'signal') {
    const sig = dev?.signals.find((s) => s.name === e.signal)
    const lbl = (v: unknown) => sig?.layout?.[String(v)] ?? (typeof v === 'number' ? +v.toFixed(2) : String(v))
    return (
      <li className="flex gap-2 text-xs">
        {time}
        <span className="text-slate-600">
          {FAMILY_ICON[dev?.family ?? ''] ?? ''} {dev?.title ?? e.device_id}: {e.title ?? e.signal}{' '}
          <span className="text-slate-400">{lbl(e.prev)} →</span> <b className="font-semibold text-slate-800">{lbl(e.value)}</b>
          {e.source === 'command' && <span className="ml-1 text-violet-500">команда</span>}
          {e.source === 'inject' && <span className="ml-1 text-amber-600">мир</span>}
        </span>
      </li>
    )
  }
  if (e.kind === 'rule') {
    const tone = e.phase === 'ok' ? 'text-emerald-700 bg-emerald-50' : e.phase === 'skipped' ? 'text-slate-500 bg-slate-50' : e.phase === 'running' ? 'text-indigo-700 bg-indigo-50' : 'text-rose-700 bg-rose-50'
    return (
      <li className={cx('flex gap-2 rounded-lg px-2 py-1 text-xs', tone)}>
        {time}
        <span>⚙︎ {e.message}</span>
      </li>
    )
  }
  if (e.kind === 'notify') {
    return (
      <li className="flex gap-2 rounded-lg bg-sky-50 px-2 py-1 text-xs text-sky-800">
        {time}
        <span>
          {e.target === 'concierge' ? '🛎 Консьержу' : '📱 Жителю'}: {e.message}
        </span>
      </li>
    )
  }
  if (e.kind === 'device') {
    return (
      <li className="flex gap-2 text-xs text-slate-500">
        {time}
        <span>
          {dev?.title ?? e.device_id}: {e.message ?? e.action}
        </span>
      </li>
    )
  }
  return (
    <li className="flex gap-2 text-[11px] text-slate-400">
      {time}
      <span className="font-mono">{e.message}</span>
    </li>
  )
}

// ---------- Студия: конструктор, редактор, песочница ----------

export function Studio() {
  const [open, setOpen] = useState<Device | null>(null)
  return (
    <div className="grid gap-5 p-5 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      <aside>
        <DeviceList onOpen={setOpen} />
      </aside>
      <main className="min-w-0">
        <RulesSection />
      </main>
      <aside>
        <Sandbox />
        <div className="mt-5">
          <EventFeed />
        </div>
      </aside>
      <DeviceDetail device={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function Sandbox() {
  const devices = useStore((s) => s.devices)
  const leak = devices.find((d) => d.family === 'leak')
  const fire = devices.find((d) => d.family === 'fire')
  const valve = devices.find((d) => d.family === 'valve')
  return (
    <Card className="p-4">
      <SectionTitle>Песочница</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {leak && (
          <>
            <Button onClick={() => guard(api.inject(leak.id, 'wet', 1))}>💧 Протечка</Button>
            <Button variant="ghost" onClick={() => guard(api.inject(leak.id, 'wet', 0))}>
              Высушить
            </Button>
          </>
        )}
        {fire && (
          <>
            <Button onClick={() => guard(api.inject(fire.id, 'smoke', 90))}>🔥 Дым</Button>
            <Button variant="ghost" onClick={() => guard(api.inject(fire.id, 'smoke', 0))}>
              Проветрить
            </Button>
          </>
        )}
        {valve && (
          <>
            <Button onClick={() => guard(api.patchDevice(valve.id, { online: !valve.online }))}>
              {valve.online ? '📵 Клапан офлайн' : '📶 Клапан онлайн'}
            </Button>
            <Button variant="ghost" onClick={() => guard(api.command(valve.id, 'valve', 1))}>
              Открыть воду
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

// ---------- Житель: телефон ----------

export function ResidentScreen() {
  const devices = useStore((s) => s.devices).filter((d) => d.scope === 'apartment')
  const notes = useStore((s) => s.notifications).filter((n) => n.target === 'resident')
  const rules = useStore((s) => s.rules).filter((r) => r.owner === 'resident')
  const all = useStore((s) => s.devices)
  const reload = useStore((s) => s.reloadRules)
  const [tab, setTab] = useState<'home' | 'rules' | 'alerts'>('home')
  const alarm = devices.some(isAlarm)
  return (
    <div className="flex justify-center p-6">
      <div className="w-[390px] overflow-hidden rounded-[44px] border-[10px] border-slate-900 bg-slate-50 shadow-2xl">
        <div className={cx('px-5 pb-4 pt-6 text-white', alarm ? 'bg-rose-600' : 'bg-indigo-600')}>
          <div className="text-xs opacity-80">ЖК «Северный» · кв. 2806</div>
          <div className="mt-1 text-xl font-semibold">{alarm ? 'Внимание: авария' : 'Дома всё спокойно'}</div>
          {notes.length > 0 && <div className="mt-2 rounded-xl bg-white/15 p-2 text-sm">{notes[notes.length - 1].message}</div>}
        </div>
        <div className="h-[480px] overflow-y-auto p-4">
          {tab === 'home' && (
            <div className="grid grid-cols-2 gap-3">
              {devices.map((d) => (
                <PhoneTile key={d.id} d={d} />
              ))}
            </div>
          )}
          {tab === 'rules' && (
            <div className="space-y-2">
              <RuleFromText role="resident" compact />
              {rules.map((r) => {
                const { when, acts } = describeRule(r, all)
                return (
                  <Card key={r.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold">{r.title}</div>
                      <button
                        className={cx('relative h-6 w-11 shrink-0 rounded-full transition', r.enabled ? 'bg-indigo-600' : 'bg-slate-300')}
                        onClick={async () => {
                          await guard(api.updateRule({ ...r, enabled: !r.enabled, status: !r.enabled ? 'active' : r.status }))
                          reload()
                        }}
                      >
                        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', r.enabled ? 'left-[22px]' : 'left-0.5')} />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Когда {when}, то {acts.join(', ')}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
          {tab === 'alerts' && <NotificationList notes={notes} />}
        </div>
        <nav className="grid grid-cols-3 border-t border-slate-200 bg-white text-xs">
          {(
            [
              ['home', '🏠', 'Дом'],
              ['rules', '⚙︎', 'Сценарии'],
              ['alerts', '🔔', 'События'],
            ] as const
          ).map(([k, icon, t]) => (
            <button key={k} onClick={() => setTab(k)} className={cx('py-3', tab === k ? 'text-indigo-600' : 'text-slate-500')}>
              <div className="text-lg">{icon}</div>
              {t}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

function PhoneTile({ d }: { d: Device }) {
  const alarm = isAlarm(d)
  const lamp = d.signals.find((s) => s.name === 'lamp')
  const valve = d.signals.find((s) => s.name === 'valve')
  const toggle = lamp ?? valve
  return (
    <div className={cx('rounded-2xl p-3 ring-1', alarm ? 'bg-rose-50 ring-rose-300' : 'bg-white ring-slate-200', !d.online && 'opacity-50')}>
      <div className="flex items-start justify-between">
        <span className="text-2xl">{FAMILY_ICON[d.family] ?? '🔌'}</span>
        {toggle && (
          <button
            className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', toggle.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}
            onClick={() => guard(api.command(d.id, toggle.name, toggle.value ? 0 : 1))}
          >
            {toggle.value ? 'вкл' : 'выкл'}
          </button>
        )}
      </div>
      <div className="mt-2 text-sm font-medium leading-tight">{d.title}</div>
      <div className={cx('text-xs', alarm ? 'font-semibold text-rose-600' : 'text-slate-500')}>{keySignal(d)}</div>
    </div>
  )
}

function NotificationList({ notes }: { notes: Notification[] }) {
  if (!notes.length) return <div className="py-10 text-center text-sm text-slate-400">Пока тихо</div>
  return (
    <div className="space-y-2">
      {[...notes].reverse().map((n) => (
        <div
          key={n.id}
          className={cx(
            'rounded-xl p-3 text-sm ring-1',
            n.level === 'critical' ? 'bg-rose-50 ring-rose-200' : n.level === 'warning' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-200',
          )}
        >
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>{n.rule_title ?? 'система'}</span>
            <span>{timeOf(n.ts)}</span>
          </div>
          <div className="mt-0.5">{n.message}</div>
        </div>
      ))}
    </div>
  )
}

// ---------- Консьерж / УК: BMS ----------

export function ConciergeScreen() {
  const devices = useStore((s) => s.devices)
  const notes = useStore((s) => s.notifications).filter((n) => n.target === 'concierge')
  const [open, setOpen] = useState<Device | null>(null)
  const alarms = devices.filter(isAlarm)
  const offline = devices.filter((d) => !d.online)
  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi title="Устройств" value={devices.length} />
          <Kpi title="Аварий сейчас" value={alarms.length} tone={alarms.length ? 'red' : 'green'} />
          <Kpi title="Нет связи" value={offline.length} tone={offline.length ? 'amber' : 'green'} />
          <Kpi title="Сигналов консьержу" value={notes.length} />
        </div>
        <Card className="p-4">
          <SectionTitle>Дом и квартиры</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {(['building', 'apartment'] as const).map((scope) => (
              <div key={scope}>
                <div className="mb-2 text-xs font-semibold text-slate-500">{scope === 'building' ? 'Общедомовое' : 'Кв. 2806'}</div>
                <div className="space-y-1.5">
                  {devices
                    .filter((d) => d.scope === scope)
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setOpen(d)}
                        className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ring-1', isAlarm(d) ? 'bg-rose-50 ring-rose-200' : 'ring-slate-200 hover:bg-slate-50')}
                      >
                        <Dot on={d.online} />
                        <span>{FAMILY_ICON[d.family]}</span>
                        <span className="flex-1 truncate">{d.title}</span>
                        <span className="text-xs text-slate-500">{keySignal(d)}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <RuleFromText role="uk" />
        <RulesSection filter={(r) => r.owner === 'uk' || r.scope === 'building'} owner="uk" />
      </div>
      <div className="space-y-5">
        <Card className="p-4">
          <SectionTitle right={<Badge tone="red">{notes.filter((n) => n.level === 'critical').length} критичных</Badge>}>Сигналы консьержу</SectionTitle>
          <div className="max-h-96 overflow-y-auto">
            <NotificationList notes={notes} />
          </div>
        </Card>
        <Card className="p-4">
          <EventFeed compact />
        </Card>
      </div>
      <DeviceDetail device={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function Kpi({ title, value, tone = 'gray' }: { title: string; value: number; tone?: 'gray' | 'red' | 'green' | 'amber' }) {
  const c = { gray: 'text-slate-900', red: 'text-rose-600', green: 'text-emerald-600', amber: 'text-amber-600' }[tone]
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className={cx('mt-1 text-3xl font-semibold tabular-nums', c)}>{value}</div>
    </Card>
  )
}
