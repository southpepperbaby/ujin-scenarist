import type { Device } from '../../api'
import { isAlarm } from '../../shared/device-values'
import type { DispatchData } from '../../shared/use-dispatch'
import { Icon } from '../../shared/ui/Icon'
import { IncidentRow } from './IncidentRow'
import { KpiCard } from './KpiCard'
import { Panel } from './Panel'
import { TicketRow } from './TicketRow'

const OPEN_TICKET_STATUSES = ['new', 'accepted', 'in_progress']
const PREVIEW = 4

type DashboardPageProps = {
  devices: Device[]
  dispatch: DispatchData
}

export function DashboardPage({ devices, dispatch }: DashboardPageProps) {
  const { incidents, tickets, contractors, categories, reload } = dispatch
  const alarms = devices.filter(isAlarm)
  const offline = devices.filter((device) => !device.online)
  const open = tickets.filter((ticket) => OPEN_TICKET_STATUSES.includes(ticket.status))
  const drafts = tickets.filter((ticket) => ticket.status === 'draft')
  const auto = incidents.filter((incident) => incident.decision === 'auto').length
  const autoShare = incidents.length > 0 ? auto / incidents.length : 0

  const latestIncidents = [...incidents].reverse().slice(0, PREVIEW)

  return (
    <div className="space-y-5 px-7 py-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          index={0}
          label="Аварий сейчас"
          value={alarms.length}
          hint={`инцидентов за сутки: ${incidents.length}`}
          icon="alert"
          tone={alarms.length > 0 ? 'alert' : 'ok'}
        />
        <KpiCard
          index={1}
          label="Заявок в работе"
          value={open.length}
          hint={`${drafts.length} ждут подтверждения`}
          icon="wrench"
        />
        <KpiCard
          index={2}
          label="Нет связи"
          value={offline.length}
          hint={`устройств всего: ${devices.length}`}
          icon="wifiOff"
          tone={offline.length > 0 ? 'alert' : 'ok'}
        />
        <KpiCard
          index={3}
          label="Ушло без человека"
          value={Math.round(autoShare * 100)}
          suffix="%"
          hint={`остальное черновики, пул из ${contractors.length} подрядчиков`}
          icon="spark"
          tone="ok"
        />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Лента инцидентов" action={{ label: 'Все инциденты', to: '/uk/incidents' }}>
          {latestIncidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
          {latestIncidents.length === 0 && (
            <p className="px-5 py-8 text-center text-[13px] text-ink-mute">
              Инцидентов нет. Подайте воду на датчик в песочнице, чтобы увидеть работу автодиспетчера.
            </p>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Очередь заявок" action={{ label: 'Все заявки', to: '/uk/tickets' }}>
            {tickets.slice(-PREVIEW).reverse().map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} categories={categories} onChanged={reload} />
            ))}
            {tickets.length === 0 && (
              <p className="px-5 py-8 text-center text-[13px] text-ink-mute">Заявок нет.</p>
            )}
          </Panel>

          <Panel title="Как решает автодиспетчер">
            <div className="space-y-3 px-5 py-4 text-[13px] text-ink-dim">
              <p className="flex items-start gap-2">
                <Icon name="spark" size={15} className="mt-0.5 shrink-0 text-accent" />
                Известные аварии решает таблица, без ИИ. Jev подключается к неизвестным неисправностям и сочетаниям тревог.
              </p>
              <p className="flex items-start gap-2">
                <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-ok" />
                Гейты: защита от дребезга, дедупликация по устройству, лимит заявок в сутки.
              </p>
              <p className="flex items-start gap-2">
                <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-sev-minor" />
                Уровень 3: отправка сразу. Уровни 1-2: черновик и подтверждение одной кнопкой.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
