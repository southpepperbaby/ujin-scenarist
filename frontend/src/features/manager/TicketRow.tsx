import { api, type Ticket } from '../../api'
import { formatSlaDue, isOverdue } from '../../shared/format'
import { levelStyle } from '../../shared/severity'
import { guard } from '../../store'
import { TICKET_STATUS } from '../../shared/ticket-status'
import { Icon } from '../../shared/ui/Icon'
import { StatusPill } from '../../shared/ui/StatusPill'

type TicketRowProps = {
  ticket: Ticket
  categories: Record<string, string>
  onChanged: () => void
}

export function TicketRow({ ticket, categories, onChanged }: TicketRowProps) {
  const status = TICKET_STATUS[ticket.status]
  const style = levelStyle(ticket.level)
  const overdue = isOverdue(ticket.sla_due)

  const move = async (status: 'new' | 'cancelled') => {
    await guard(api.moveTicket(ticket.id, status, 'консьерж'))
    onChanged()
  }

  return (
    <article className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-raised/40">
      <span className={`w-20 shrink-0 font-mono text-[12px] ${style.text}`}>{ticket.id}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{ticket.title}</p>
        <p className="truncate text-[12px] text-ink-mute">
          {categories[ticket.category] ?? ticket.category} · {ticket.contractor_name ?? 'подрядчик не выбран'} ·{' '}
          {ticket.address}
        </p>
      </div>

      <span className={`hidden w-44 shrink-0 text-[12px] lg:block ${overdue ? 'text-sev-crit' : 'text-ink-dim'}`}>
        {formatSlaDue(ticket.sla_due)}
      </span>

      {ticket.status === 'draft' ? (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => void move('new')}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-accent-ink transition hover:brightness-110"
          >
            <Icon name="arrowRight" size={13} />
            Отправить
          </button>
          <button
            type="button"
            onClick={() => void move('cancelled')}
            className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-dim transition hover:text-ink"
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
