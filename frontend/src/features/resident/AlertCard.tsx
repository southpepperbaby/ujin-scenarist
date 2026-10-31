import { api, type Notification, type Ticket } from '../../api'
import { formatWhen } from '../../shared/format'
import { levelOfNotice, levelStyle } from '../../shared/severity'
import { ticketStatus } from '../../shared/ticket-status'
import { Icon } from '../../shared/ui/Icon'
import { StatusPill } from '../../shared/ui/StatusPill'
import { useState } from 'react'

import { guard } from '../../store'

type AlertCardProps = {
  notice: Notification
  /** Заявка, о которой это уведомление: черновик жителя получает кнопки, остальные показывают статус. */
  ticket?: Ticket
  onTicketChanged?: () => void
}

export function AlertCard({ notice, ticket, onTicketChanged }: AlertCardProps) {
  const style = levelStyle(levelOfNotice(notice.level))
  const waitsForMe = ticket?.status === 'draft' && ticket.needs_confirmation === 'resident'

  const [busy, setBusy] = useState(false)

  const move = async (status: 'new' | 'cancelled') => {
    if (!ticket || busy) return
    setBusy(true)
    await guard(api.moveTicket(ticket.id, status, 'житель'))
    setBusy(false)
    onTicketChanged?.()
  }

  return (
    <article className={`rounded-2xl border p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas/40 ${style.text}`}>
          <Icon name={style.icon} size={18} />
          <span className="sr-only">{style.label}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold">{notice.rule_title ?? 'Система'}</p>
            <span className="tabular shrink-0 text-meta text-ink-mute">{formatWhen(notice.ts)}</span>
          </div>
          <p className="mt-1 text-body leading-snug text-ink-dim">{notice.message}</p>
          {ticket && !waitsForMe && (
            <div className="mt-2 flex items-center gap-2 text-meta text-ink-mute">
              <span>Заявка {ticket.id}:</span>
              <StatusPill label={ticketStatus(ticket.status).label} className={ticketStatus(ticket.status).className} />
            </div>
          )}
          {waitsForMe && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void move('new')}
                disabled={busy}
                className="press disabled:opacity-60 flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-body font-medium text-accent-ink"
              >
                <Icon name="arrowRight" size={14} />
                Отправить мастеру
              </button>
              <button
                type="button"
                onClick={() => void move('cancelled')}
                disabled={busy}
                className="press disabled:opacity-60 rounded-xl border border-line px-3 py-2 text-body text-ink-dim"
              >
                Отменить
              </button>
            </div>
          )}
          {!ticket && (
            <p className="mt-2 text-meta text-ink-mute">
              уровень {style.level}, {style.label.toLowerCase()}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
