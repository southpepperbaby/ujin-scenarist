import { api, type Notification, type Ticket } from '../../api'
import { formatClock } from '../../shared/format'
import { levelOfNotice, levelStyle } from '../../shared/severity'
import { TICKET_STATUS } from '../../shared/ticket-status'
import { Icon } from '../../shared/ui/Icon'
import { StatusPill } from '../../shared/ui/StatusPill'
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

  const move = async (status: 'new' | 'cancelled') => {
    if (!ticket) return
    await guard(api.moveTicket(ticket.id, status, 'житель'))
    onTicketChanged?.()
  }

  return (
    <article className={`rounded-2xl border p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-base/40 ${style.text}`}>
          <Icon name={style.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[14px] font-semibold">{notice.rule_title ?? 'Система'}</p>
            <span className="shrink-0 text-[12px] text-ink-mute">{formatClock(notice.ts)}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-ink-dim">{notice.message}</p>
          {ticket && !waitsForMe && (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-mute">
              <span>Заявка {ticket.id}:</span>
              <StatusPill label={TICKET_STATUS[ticket.status].label} className={TICKET_STATUS[ticket.status].className} />
            </div>
          )}
          {waitsForMe && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void move('new')}
                className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[13px] font-medium text-accent-ink"
              >
                <Icon name="arrowRight" size={14} />
                Отправить мастеру
              </button>
              <button
                type="button"
                onClick={() => void move('cancelled')}
                className="press rounded-xl border border-line px-3 py-2 text-[13px] text-ink-dim"
              >
                Отменить
              </button>
            </div>
          )}
          {!ticket && (
            <p className="mt-2 text-[12px] text-ink-mute">
              уровень {style.level}, {style.label.toLowerCase()}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
