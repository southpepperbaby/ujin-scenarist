import { useState } from 'react'

import { api, type Ticket } from '../../api'
import { formatSlaDue, isOverdue } from '../../shared/format'
import { levelStyle } from '../../shared/severity'
import { ticketStatus } from '../../shared/ticket-status'
import { toastOk } from '../../shared/toast'
import { Icon } from '../../shared/ui/Icon'
import { StatusPill } from '../../shared/ui/StatusPill'
import { guard } from '../../store'

type TicketRowProps = {
  ticket: Ticket
  categories: Record<string, string>
  onChanged: () => void
  /** Текущее время от страницы: «осталось N мин» тикает без перезагрузки. */
  now: number
}

export function TicketRow({ ticket, categories, onChanged, now }: TicketRowProps) {
  const status = ticketStatus(ticket.status)
  const style = levelStyle(ticket.level)
  const overdue = isOverdue(ticket.sla_due, now)
  const [busy, setBusy] = useState(false)

  const move = async (next: 'new' | 'cancelled') => {
    if (busy) return
    setBusy(true)
    const done = await guard(api.moveTicket(ticket.id, next, 'консьерж'))
    setBusy(false)
    if (done) toastOk(next === 'new' ? `Заявка ${ticket.id} отправлена` : `Заявка ${ticket.id} отменена`)
    onChanged()
  }

  return (
    <article className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-raised/40">
      <span className={`hidden w-24 shrink-0 items-center gap-1.5 font-mono text-meta @md:flex ${style.text}`}>
        <Icon name={style.icon} size={14} />
        <span className="sr-only">{style.label}: </span>
        {ticket.id}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{ticket.title}</p>
        <p className="truncate text-meta text-ink-mute">
          {categories[ticket.category] ?? ticket.category} · {ticket.contractor_name ?? 'подрядчик не выбран'} ·{' '}
          {ticket.address}
        </p>
      </div>

      <span
        className={`tabular hidden w-40 shrink-0 text-meta @2xl:flex @2xl:items-center @2xl:gap-1.5 ${
          overdue ? 'font-semibold text-sev-crit' : 'text-ink-dim'
        }`}
      >
        {overdue && <Icon name="clock" size={13} />}
        {formatSlaDue(ticket.sla_due, now)}
      </span>

      {ticket.status === 'draft' ? (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => void move('new')}
            disabled={busy}
            aria-label={`Отправить заявку ${ticket.id} подрядчику`}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-meta font-medium text-accent-ink transition hover:brightness-110 disabled:opacity-60"
          >
            <Icon name="arrowRight" size={13} />
            Отправить
          </button>
          <button
            type="button"
            onClick={() => void move('cancelled')}
            disabled={busy}
            aria-label={`Отменить заявку ${ticket.id}`}
            className="rounded-lg border border-line px-2.5 py-1 text-meta text-ink-dim transition hover:text-ink disabled:opacity-60"
          >
            Отменить
          </button>
        </div>
      ) : (
        <StatusPill label={status.label} className={status.className} />
      )}
    </article>
  )
}
