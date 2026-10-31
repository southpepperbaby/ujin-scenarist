import { href } from '../../app/routing'
import type { Device } from '../../api'
import { isAlarm } from '../../shared/device-values'
import { Icon } from '../../shared/ui/Icon'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonList } from '../../shared/ui/Skeleton'
import { hourlyBuckets } from '../../shared/buckets'
import type { DispatchData } from '../../shared/use-dispatch'
import { useNow } from '../../shared/use-now'
import { IncidentRow } from './IncidentRow'
import { KpiCard } from './KpiCard'
import { Panel } from './Panel'
import { TicketRow } from './TicketRow'

const OPEN_TICKET_STATUSES = ['new', 'accepted', 'in_progress']
const PREVIEW = 4
const DAY_S = 24 * 60 * 60

type DashboardPageProps = {
  devices: Device[]
  dispatch: DispatchData
}

/** Bento-сводка: KPI с трендом сверху, лента инцидентов крупно, очередь заявок сбоку. */
export function DashboardPage({ devices, dispatch }: DashboardPageProps) {
  const { incidents, tickets, contractors, categories, reload, loaded } = dispatch
  const now = useNow(60_000)
  const nowS = now / 1000
  const alarms = devices.filter(isAlarm)
  const offline = devices.filter((device) => !device.online)
  const open = tickets.filter((ticket) => OPEN_TICKET_STATUSES.includes(ticket.status))
  const drafts = tickets.filter((ticket) => ticket.status === 'draft')
  // «За сутки» — по времени, а не по длине выборки: API отдаёт последние 50, это не сутки.
  const today = incidents.filter((incident) => nowS - incident.ts < DAY_S)
  const auto = today.filter((incident) => incident.decision === 'auto').length
  const autoShare = today.length > 0 ? auto / today.length : 0
  const incidentTrend = hourlyBuckets(incidents.map((incident) => incident.ts), 24, nowS)
  const ticketTrend = hourlyBuckets(tickets.map((ticket) => ticket.created), 24, nowS)

  const latestIncidents = [...incidents].reverse().slice(0, PREVIEW)
  const latestTickets = [...tickets].reverse().slice(0, PREVIEW)

  return (
    <div className="@container space-y-5 px-7 py-6">
      <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @5xl:grid-cols-4">
        <KpiCard
          index={0}
          label="Аварий сейчас"
          value={alarms.length}
          hint={`инцидентов за сутки: ${today.length}`}
          icon="alert"
          tone={alarms.length > 0 ? 'alert' : 'ok'}
          trend={incidentTrend}
          delta={incidentTrend.at(-1)}
          href={href('/uk/incidents')}
        />
        <KpiCard
          index={1}
          label="Заявок в работе"
          value={open.length}
          hint={drafts.length > 0 ? `${drafts.length} ждут подтверждения` : 'черновиков нет'}
          icon="wrench"
          trend={ticketTrend}
          delta={ticketTrend.at(-1)}
          href={href('/uk/tickets')}
        />
        <KpiCard
          index={2}
          label="Нет связи"
          value={offline.length}
          hint={offline.length > 0 ? offline.slice(0, 2).map((d) => d.title).join(', ') : `все ${devices.length} на связи`}
          icon="wifiOff"
          tone={offline.length > 0 ? 'alert' : 'ok'}
          href={href('/uk/devices')}
        />
        <KpiCard
          index={3}
          label="Ушло без человека"
          value={Math.round(autoShare * 100)}
          suffix="%"
          hint={
            today.length > 0
              ? `${auto} из ${today.length} за сутки · пул из ${contractors.length} подрядчиков`
              : 'за сутки инцидентов не было'
          }
          icon="spark"
          tone="ok"
        />
      </div>

      <div className="grid gap-5 @6xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Лента инцидентов" action={{ label: 'Все инциденты', to: '/uk/incidents' }}>
          {!loaded && <div className="p-4"><SkeletonList count={3} className="h-20" /></div>}
          {latestIncidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
          {loaded && latestIncidents.length === 0 && (
            <EmptyState
              icon="shield"
              title="Инцидентов нет"
              hint="Подайте воду на датчик в песочнице — увидите, как автодиспетчер разбирает событие и шлёт заявку."
              action={
                <a
                  href={href('/uk/sandbox')}
                  className="press inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink"
                >
                  <Icon name="play" size={16} />
                  Открыть песочницу
                </a>
              }
            />
          )}
        </Panel>

        <Panel title="Очередь заявок" action={{ label: 'Все заявки', to: '/uk/tickets' }}>
          {!loaded && <div className="p-4"><SkeletonList count={3} className="h-14" /></div>}
          {latestTickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} categories={categories} onChanged={reload} now={now} />
          ))}
          {loaded && tickets.length === 0 && (
            <EmptyState icon="wrench" title="Заявок нет" hint="Автодиспетчер заведёт заявку сам, а вручную — на странице заявок." />
          )}
        </Panel>
      </div>
    </div>
  )
}
