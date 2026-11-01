import { forwardRef, useState } from 'react'

import type { Incident } from '../../api'
import { formatPercent, formatWhen } from '../../shared/format'
import { levelStyle } from '../../shared/severity'
import { Icon } from '../../shared/ui/Icon'
import { PulseDot } from '../../shared/ui/PulseDot'

const STATUS_LABEL: Record<Incident['status'], string> = {
  confirmed: 'Подтверждён',
  dispatched: 'Заявка создана',
  logged: 'Только журнал',
}

const AUTONOMY_THRESHOLD = 0.85

type IncidentRowProps = {
  incident: Incident
  /** Строка выбрана с клавиатуры (J/K на странице инцидентов). */
  selected?: boolean
  onFocus?: () => void
}

/**
 * Инцидент в одну строку: что, где и что уже сделано читается за секунду.
 * Уверенность модели, риск и причины раскрываются по клику, чтобы не топить главное в сером тексте.
 */
export const IncidentRow = forwardRef<HTMLElement, IncidentRowProps>(function IncidentRow(
  { incident, selected = false, onFocus },
  ref,
) {
  const [open, setOpen] = useState(false)
  const verdict = incident.verdict
  const style = levelStyle(verdict?.level ?? 0)
  const needsHuman = verdict !== null && verdict.confidence < AUTONOMY_THRESHOLD
  const detailsId = `incident-${incident.id}`

  return (
    <article
      ref={ref}
      tabIndex={-1}
      onFocus={onFocus}
      className={`border-b border-line transition last:border-b-0 ${selected ? 'bg-raised/60' : 'hover:bg-raised/40'}`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailsId}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left"
      >
        <span
          className={`inline-flex min-w-[6.5rem] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold ${style.bg} ${style.text} ${style.border}`}
        >
          <PulseDot className="text-current" active={incident.status !== 'logged' && (verdict?.level ?? 0) >= 2} />
          <Icon name={style.icon} size={12} className="shrink-0" />
          {style.short}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-lead font-medium">{incident.title}</span>
          <span className="block truncate text-meta text-ink-mute">
            {incident.device_title} · {incident.room} · {incident.scope === 'building' ? 'общедомовое' : 'квартира'}
          </span>
        </span>

        {needsHuman && (
          <span className="hidden shrink-0 rounded-md bg-sev-minor-soft px-1.5 py-0.5 text-meta font-medium text-sev-minor md:inline">
            нужно решение
          </span>
        )}

        <span className="w-32 shrink-0 text-right">
          <span className="block text-body text-ink-dim">{STATUS_LABEL[incident.status] ?? incident.status}</span>
          <span className="tabular block font-mono text-meta text-ink-mute">
            {incident.ticket_id ?? formatWhen(incident.ts)}
          </span>
        </span>
        <Icon
          name="chevronDown"
          size={16}
          className={`shrink-0 text-ink-mute transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div id={detailsId} className="enter space-y-1.5 px-5 pb-4 pl-[9.25rem] text-meta">
          {verdict && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-dim">
              <span className="flex items-center gap-1.5">
                <Icon name="spark" size={13} className="text-accent" />
                {verdict.source === 'jev' ? 'Jev' : 'таблица'}: {verdict.category}
              </span>
              <span>уверенность {formatPercent(verdict.confidence)}</span>
              {verdict.false_alarm !== null && <span>ложное срабатывание {formatPercent(verdict.false_alarm)}</span>}
              <span className="text-ink-mute">{formatWhen(incident.ts)}</span>
            </p>
          )}
          {incident.reasoning.map((reason, index) => (
            <p key={`${index}-${reason}`} className="flex items-start gap-1.5 text-ink-mute">
              <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
              {reason}
            </p>
          ))}
          {!verdict && incident.reasoning.length === 0 && <p className="text-ink-mute">Подробностей нет.</p>}
        </div>
      )}
    </article>
  )
})
