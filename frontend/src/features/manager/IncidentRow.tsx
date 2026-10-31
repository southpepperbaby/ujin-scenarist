import type { Incident } from '../../api'
import { formatClock, formatPercent } from '../../shared/format'
import { levelStyle } from '../../shared/severity'
import { Icon } from '../../shared/ui/Icon'

const STATUS_LABEL: Record<Incident['status'], string> = {
  confirmed: 'Подтверждён',
  dispatched: 'Заявка создана',
  logged: 'Только журнал',
}

const AUTONOMY_THRESHOLD = 0.85

export function IncidentRow({ incident }: { incident: Incident }) {
  const verdict = incident.verdict
  const style = levelStyle(verdict?.level ?? 0)

  return (
    <article className="flex gap-4 border-b border-line px-5 py-4 last:border-b-0 hover:bg-raised/40">
      <div className="w-24 shrink-0 pt-0.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style.bg} ${style.text} ${style.border}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {style.short}
        </span>
        <p className="mt-2 font-mono text-[12px] text-ink-mute">{formatClock(incident.ts)}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{incident.title}</p>
        <p className="mt-0.5 text-[13px] text-ink-mute">
          {incident.device_title} · {incident.room} ·{' '}
          {incident.scope === 'building' ? 'общедомовое' : 'квартира'}
        </p>

        {verdict && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
            <span className="flex items-center gap-1.5 text-ink-dim">
              <Icon name="spark" size={13} className="text-accent" />
              {verdict.source === 'jev' ? 'Jev' : 'таблица'}: {verdict.category}
              <span className="text-ink-mute">· уверенность {formatPercent(verdict.confidence)}</span>
            </span>
            <span className="text-ink-mute">риск ущерба {formatPercent(verdict.damage)}</span>
            {verdict.confidence < AUTONOMY_THRESHOLD && (
              <span className="rounded-md bg-sev-minor-soft px-1.5 py-0.5 text-sev-minor">
                нужно решение человека
              </span>
            )}
          </div>
        )}

        {incident.reasoning.slice(0, 2).map((reason) => (
          <p key={reason} className="mt-1.5 flex items-start gap-1.5 text-[12px] text-ink-mute">
            <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
            {reason}
          </p>
        ))}
      </div>

      <div className="w-36 shrink-0 text-right">
        <p className="text-[13px] text-ink-dim">{STATUS_LABEL[incident.status]}</p>
        {incident.ticket_id && <p className="mt-1 font-mono text-[12px] text-ink-mute">{incident.ticket_id}</p>}
      </div>
    </article>
  )
}
