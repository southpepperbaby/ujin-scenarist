import { useStore } from '../../store'
import { useDispatchData } from '../../shared/use-dispatch'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonList } from '../../shared/ui/Skeleton'
import { AlertCard } from './AlertCard'

export function AlertsScreen({ demo }: { demo: boolean }) {
  const { tickets, reload, loaded: ticketsLoaded } = useDispatchData(demo, 'resident')
  const loaded = useStore((state) => state.loaded)
  const all = useStore((state) => state.notifications)
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]))
  const visible = all.filter((n) => n.target === 'resident').reverse()

  return (
    <div className="space-y-4 px-5 pt-4 pb-8">
      <header>
        <h1 className="text-2xl font-semibold">События</h1>
        <p className="mt-1 text-body text-ink-mute">Уровень подсказывает, нужна ли ваша реакция прямо сейчас.</p>
      </header>

      {!loaded || (!ticketsLoaded && visible.some((n) => n.ticket_id)) ? (
        <SkeletonList count={3} className="h-24" />
      ) : (
        <div className="space-y-2.5">
          {visible.map((notice, index) => (
            <AlertCard
              key={`${notice.id}-${index}`}
              notice={notice}
              ticket={notice.ticket_id ? byId.get(notice.ticket_id) : undefined}
              onTicketChanged={reload}
            />
          ))}
          {visible.length === 0 && (
            <EmptyState
              icon="bell"
              title="Пока тихо"
              hint="Сюда придут уведомления сценариев и заявки, которые ждут вашего решения."
              className="surface rounded-2xl"
            />
          )}
        </div>
      )}
    </div>
  )
}
