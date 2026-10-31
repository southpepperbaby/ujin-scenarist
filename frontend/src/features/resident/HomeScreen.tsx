import { useState } from 'react'

import { href, scenarioPath } from '../../app/routing'
import type { Device, Notification } from '../../api'
import { isAlarm } from '../../shared/device-values'
import { formatWhen } from '../../shared/format'
import { useNow } from '../../shared/use-now'
import { levelOfNotice, levelStyle } from '../../shared/severity'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Icon } from '../../shared/ui/Icon'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useStore } from '../../store'
import { DeviceTile } from './DeviceTile'

/** Общедомовые устройства, которыми житель управляет сам, — показываем рядом с квартирными. */
const RESIDENT_SHARED_FAMILIES = ['barrier']
/** Баннер на главной — для свежего; старое живёт во вкладке «События». */
const BANNER_FRESH_S = 24 * 60 * 60
const DISMISSED_KEY = 'homie.bannerDismissed'

function AlertBanner({ notice, onDismiss }: { notice: Notification; onDismiss: () => void }) {
  const style = levelStyle(levelOfNotice(notice.level))
  return (
    <div className={`enter relative flex items-start gap-3 rounded-2xl border p-4 ${style.bg} ${style.border}`} role="status">
      <Icon name={style.icon} size={20} className={`mt-0.5 shrink-0 ${style.text}`} />
      <a href={href('/resident/alerts')} className="min-w-0 flex-1 rounded-lg">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">
            <span className="sr-only">{style.label}: </span>
            {notice.rule_title ?? 'Система'}
          </span>
          <span className="tabular shrink-0 text-meta text-ink-mute">{formatWhen(notice.ts)}</span>
        </span>
        <span className="mt-1 block text-body leading-snug text-ink-dim">{notice.message}</span>
      </a>
      <button
        type="button"
        onClick={onDismiss}
        className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-mute hover:bg-canvas/40 hover:text-ink"
        aria-label="Скрыть уведомление"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

/** Комната живым заголовком: сколько устройств и что с ними прямо сейчас. */
function RoomSection({ room, devices, offset }: { room: string; devices: Device[]; offset: number }) {
  const alarms = devices.filter(isAlarm).length
  const offline = devices.filter((device) => !device.online).length
  return (
    <section className="space-y-2.5" aria-label={room}>
      <div className="flex items-baseline justify-between px-0.5">
        <h3 className="text-sm font-semibold">{room}</h3>
        <span className="text-meta text-ink-mute">
          {alarms > 0 ? (
            <span className="font-semibold text-sev-crit">авария: {alarms}</span>
          ) : offline > 0 ? (
            <span>нет связи: {offline}</span>
          ) : (
            <span className="text-ok">всё в порядке</span>
          )}
          {' · '}
          {devices.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {devices.map((device, index) => (
          <DeviceTile key={device.id} device={device} index={offset + index} />
        ))}
      </div>
    </section>
  )
}

function groupByRoom(devices: Device[]): [string, Device[]][] {
  const rooms = new Map<string, Device[]>()
  for (const device of devices) {
    const room = device.room || 'Без комнаты'
    rooms.set(room, [...(rooms.get(room) ?? []), device])
  }
  // Комнаты с аварией наверх: главное видно без прокрутки.
  return [...rooms.entries()].sort(([, a], [, b]) => Number(b.some(isAlarm)) - Number(a.some(isAlarm)))
}

export function HomeScreen({ demo }: { demo: boolean }) {
  const devices = useStore((state) => state.devices)
  const notifications = useStore((state) => state.notifications)
  const rules = useStore((state) => state.rules)
  const loaded = useStore((state) => state.loaded)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) ?? '')
  const now = useNow(60_000)

  const mine = devices.filter(
    (device) => device.scope === 'apartment' || RESIDENT_SHARED_FAMILIES.includes(device.family),
  )
  const latest = notifications.findLast((notice) => notice.target === 'resident')
  const showBanner = latest && latest.id !== dismissed && now / 1000 - latest.ts < BANNER_FRESH_S
  const active = rules.filter((rule) => rule.owner === 'resident' && rule.enabled)
  const rooms = groupByRoom(mine)

  const dismiss = () => {
    if (!latest) return
    localStorage.setItem(DISMISSED_KEY, latest.id)
    setDismissed(latest.id)
  }

  return (
    <div className="space-y-6 px-5 pt-4 pb-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-body text-ink-mute">ЖК «Северный», корп. 1, кв. 2806</p>
          <h1 className="text-2xl">Мой дом</h1>
        </div>
        <a
          href={href('/resident/profile')}
          className="flex size-10 items-center justify-center rounded-full bg-raised text-ink-dim"
          aria-label="Профиль"
        >
          <Icon name="user" size={20} />
        </a>
      </header>

      {demo && (
        <p className="rounded-xl border border-line bg-raised px-3 py-2 text-meta text-ink-mute" role="status">
          Бэкенд не отвечает, показан демо-набор. Подключимся сами, как только он поднимется.
        </p>
      )}

      {showBanner && <AlertBanner notice={latest} onDismiss={dismiss} />}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title">Мои устройства</h2>
          {loaded && <span className="text-body text-ink-mute">{mine.length}</span>}
        </div>
        {!loaded && (
          <div className="grid grid-cols-2 gap-2.5" role="status">
            <span className="sr-only">Загружаем устройства…</span>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
        )}
        {loaded && mine.length === 0 && (
          <EmptyState
            icon="home"
            title="Устройств пока нет"
            hint="Управляющая компания подключит датчики квартиры — они появятся здесь сами."
            className="surface rounded-2xl"
          />
        )}
        {rooms.map(([room, list], index) => (
          <RoomSection
            key={room}
            room={room}
            devices={list}
            offset={rooms.slice(0, index).reduce((sum, [, items]) => sum + items.length, 0)}
          />
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title">Сценарии работают</h2>
          <a href={href('/resident/scenarios')} className="text-body font-medium text-accent">
            Все
          </a>
        </div>
        {active.length === 0 && loaded && (
          <EmptyState
            icon="bolt"
            title="Ни один сценарий не включён"
            hint="Опишите словами, что должно происходить, — соберём и проверим правило."
            action={
              <a
                href={href('/resident/scenarios')}
                className="press inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink"
              >
                <Icon name="plus" size={16} />
                Создать сценарий
              </a>
            }
            className="surface rounded-2xl"
          />
        )}
        <div className="space-y-2">
          {active.map((rule) => (
            <a
              key={rule.id}
              href={href(scenarioPath(rule.id))}
              className="surface flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition hover:border-line-strong"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name="bolt" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{rule.title}</span>
                <span className="block truncate text-meta text-ink-mute">{rule.description}</span>
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-ink-mute" />
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
