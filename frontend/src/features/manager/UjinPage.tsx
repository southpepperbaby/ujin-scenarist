import { useCallback, useEffect, useRef, useState } from 'react'

import { api, type Health, type Rule, type UjinExport, type UjinPush, type UjinStatus } from '../../api'
import { formatWhen } from '../../shared/format'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Icon } from '../../shared/ui/Icon'
import { SkeletonList } from '../../shared/ui/Skeleton'
import { StatusPill } from '../../shared/ui/StatusPill'
import { Toggle } from '../../shared/ui/Toggle'
import { toastError, toastOk } from '../../shared/toast'
import { guard, useStore } from '../../store'
import { Panel } from './Panel'

/** Сводка одной цифрой: опубликовано сигналов, пачек, ошибок. */
function Stat({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-raised/40 px-3 py-2">
      <p className="text-caption tracking-widest text-ink-mute uppercase">{label}</p>
      <p className={`tabular mt-0.5 text-lead font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line/70 py-2 first:border-t-0">
      <span className="shrink-0 text-body text-ink-mute">{label}</span>
      <span className="min-w-0 text-right text-body break-words">{children}</span>
    </div>
  )
}

/** Одно правило: что из него платформа примет, чего не поймёт и чем кончилась отправка. */
function ExportRow({ item, rule, onPushed }: { item: UjinExport; rule?: Rule; onPushed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UjinPush | null>(null)
  const sendable = item.set_signal !== ''

  const push = async () => {
    setBusy(true)
    const out = await guard(api.ujinPush(item.rule_id))
    setBusy(false)
    if (!out) return
    setResult(out)
    if (out.ok && out.activated) toastOk(`«${item.title}» отправлено на стенд и включено`)
    else if (out.ok) toastOk(`«${item.title}» отправлено на стенд`)
    else toastError(out.detail ?? 'Платформа не приняла сценарий')
    onPushed()
  }

  return (
    <li className="border-t border-line px-5 py-3.5 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {item.title}
            {rule && !rule.enabled && <span className="ml-2 text-meta text-ink-mute">(у нас выключено)</span>}
          </p>
          <p className="mt-1 font-mono text-caption break-all text-ink-mute">{item.condition}</p>
          <p className="font-mono text-caption break-all text-ink-dim">{item.set_signal || '— команд устройствам нет'}</p>
        </div>
        <Button variant="secondary" icon="arrowRight" busy={busy} disabled={!sendable} onClick={() => void push()}>
          На стенд
        </Button>
      </div>

      {item.unsupported.length > 0 && (
        <p className="mt-2 text-meta text-ink-mute">
          Платформа не выразит: {item.unsupported.join(', ')}. Это исполняет наш движок.
        </p>
      )}

      {result && (
        <p className={`mt-2 text-meta ${result.ok ? 'text-ok' : 'text-sev-crit'}`}>
          {result.ok
            ? `Сценарий ${result.scenario_id ?? ''} ${result.activated ? 'создан и включён' : 'создан'}.`
            : 'Не принято.'}
          {result.detail ? ` ${result.detail}` : ''}
          {!result.live && ' Режим сухого прогона: на стенд ничего не ушло.'}
        </p>
      )}
    </li>
  )
}

/**
 * Интеграция с Ujin OS: что уходит на стенд и что приходит обратно.
 * Публикация сигналов идёт пачками сама; здесь видно её состояние, привязку эмуляторов
 * к устройствам стенда и отправку правил в autoscripts платформы.
 */
export function UjinPage() {
  const rules = useStore((state) => state.rules)
  const [status, setStatus] = useState<UjinStatus | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [exports, setExports] = useState<UjinExport[]>([])
  const [scripts, setScripts] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)

  // Ответ запроса, пущенного до ухода со страницы, применять уже некуда.
  const alive = useRef(true)
  const reload = useCallback(() => {
    void Promise.all([guard(api.ujinStatus()), guard(api.health()), guard(api.ujinExport())]).then(
      ([nextStatus, nextHealth, nextExports]) => {
        if (!alive.current) return
        if (nextStatus) setStatus(nextStatus)
        if (nextHealth) setHealth(nextHealth)
        if (nextExports) setExports(nextExports)
        setLoading(false)
      },
    )
  }, [])

  useEffect(() => {
    alive.current = true
    reload()
    return () => {
      alive.current = false
    }
  }, [reload])

  const setLive = async (live: boolean) => {
    setSwitching(true)
    const next = await guard(api.ujinLive(live))
    setSwitching(false)
    if (!next) return
    setStatus(next)
    toastOk(next.live ? 'Публикация на стенд включена' : 'Публикация на стенд выключена')
  }

  const loadScripts = async () => {
    const out = await guard(api.ujinScripts())
    if (out !== undefined) setScripts(out)
  }

  if (loading) {
    return (
      <div className="px-7 py-6">
        <SkeletonList count={3} className="h-28" />
      </div>
    )
  }

  const byId = new Map(rules.map((rule) => [rule.id, rule]))
  const configured = status?.configured ?? false

  return (
    <div className="@container space-y-5 px-7 py-6">
      <Panel title="Мост в Ujin OS">
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <StatusPill
                label={status?.live ? 'публикуем на стенд' : 'сухой прогон'}
                className={status?.live ? 'bg-ok-soft text-ok' : 'bg-field text-ink-mute'}
              />
              {!configured && (
                <span className="text-meta text-ink-mute">
                  нет <code>secrets/ujin.json</code> — публиковать некуда
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 text-body text-ink-dim">
              Публиковать сигналы
              <Toggle
                checked={status?.live ?? false}
                disabled={!configured || switching}
                onChange={(next) => void setLive(next)}
                label="Публиковать сигналы на стенд Ujin"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
            <Stat label="Сигналов" value={status?.published ?? 0} />
            <Stat label="Пачек" value={status?.batches ?? 0} />
            <Stat
              label="Ошибок"
              value={status?.errors ?? 0}
              tone={(status?.errors ?? 0) > 0 ? 'text-sev-crit' : 'text-ok'}
            />
            <Stat label="Устройств на стенде" value={status?.bound.length ?? 0} />
          </div>

          <div>
            <Row label="API стенда">
              <code className="text-caption">{status?.base_url ?? '—'}</code>
            </Row>
            <Row label="Квартира">{status?.apartment_id || '—'}</Row>
            <Row label="Последняя удачная публикация">
              {status?.last_ok ? formatWhen(status.last_ok) : 'ещё не было'}
            </Row>
            {status?.last_error && (
              <Row label="Последняя ошибка">
                <span className="text-sev-crit">{status.last_error}</span>
              </Row>
            )}
            <Row label="Модель для правил из текста">
              {health?.ai ? (
                <code className="text-caption">{health.llm_model}</code>
              ) : (
                <span className="text-sev-minor">ключ не задан, чат соберёт правило только с ним</span>
              )}
            </Row>
          </div>
        </div>
      </Panel>

      <Panel title="Эмуляторы, привязанные к устройствам стенда">
        {status && status.bound.length > 0 ? (
          <ul>
            {status.bound.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line px-5 py-2.5 first:border-t-0"
              >
                <span className="text-body">{device.title}</span>
                <span className="font-mono text-caption text-ink-mute">
                  sn {device.sn} · ext {device.ext}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="wifiOff"
            title="Привязок нет"
            hint="Устройства стенда перечислены в secrets/ujin.json и раздаются эмуляторам по семейству."
          />
        )}
      </Panel>

      <Panel title="Правила в формате autoscripts платформы">
        {exports.length > 0 ? (
          <ul>
            {exports.map((item) => (
              <ExportRow key={item.rule_id} item={item} rule={byId.get(item.rule_id)} onPushed={() => void reload()} />
            ))}
          </ul>
        ) : (
          <EmptyState icon="sliders" title="Правил пока нет" hint="Создайте правило — здесь появится его экспорт." />
        )}
      </Panel>

      <Panel title="Сценарии на платформе">
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" icon="activity" onClick={() => void loadScripts()}>
              Запросить список
            </Button>
            <span className="text-meta text-ink-mute">
              Ответ платформы как есть: токен жителя в нём вырезан.
            </span>
          </div>
          {scripts !== null && (
            <pre className="scroll-slim max-h-72 overflow-auto rounded-xl border border-line bg-canvas/60 p-3 font-mono text-caption">
              {JSON.stringify(scripts, null, 2)}
            </pre>
          )}
        </div>
      </Panel>

      <p className="flex items-start gap-2 text-meta text-ink-mute">
        <Icon name="info" size={14} className="mt-0.5 shrink-0" />
        <span>
          Команды «платформа → устройство» на этом стенде не доходят: автословари создаются только на чтение
          (ограничение стенда, п.2 организаторов). Поэтому мост односторонний — сигналы вверх и сценарии в
          autoscripts.
        </span>
      </p>
    </div>
  )
}
