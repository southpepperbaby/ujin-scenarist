import { useStore } from '../../store'
import { useDispatchData } from '../../shared/use-dispatch'
import { AlertCard } from './AlertCard'

export function AlertsScreen({ demo }: { demo: boolean }) {
  const { tickets, reload } = useDispatchData(demo, 'resident')
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]))
  const notifications = useStore((state) => state.notifications).filter((n) => n.target === 'resident')
  const visible = [...notifications].reverse()

  return (
    <div className="space-y-4 px-5 pt-4 pb-8">
      <header>
        <h1 className="text-2xl font-semibold">События</h1>
        <p className="mt-1 text-[13px] text-ink-mute">
          Уровень подсказывает, нужна ли ваша реакция прямо сейчас.
        </p>
      </header>

      <div className="space-y-2.5">
        {visible.map((notice) => (
          <AlertCard
            key={notice.id}
            notice={notice}
            ticket={notice.ticket_id ? byId.get(notice.ticket_id) : undefined}
            onTicketChanged={reload}
          />
        ))}
        {visible.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-[13px] text-ink-mute">
            Пока тихо.
          </p>
        )}
      </div>
    </div>
  )
}
