import { Aurora } from '../../shared/ui/Aurora'
import { useStore } from '../../store'
import { useDispatchData } from '../../shared/use-dispatch'
import { AssistantPage } from './AssistantPage'
import { DashboardPage } from './DashboardPage'
import { DevicesPage } from './DevicesPage'
import { IncidentsPage } from './IncidentsPage'
import { RulesPage } from './RulesPage'
import { SandboxPage } from './SandboxPage'
import { Sidebar } from './Sidebar'
import { TicketsPage } from './TicketsPage'
import { TopBar } from './TopBar'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/uk': { title: 'Дашборд', subtitle: 'ЖК «Северный», корп. 1 · общедомовое оборудование и квартиры' },
  '/uk/assistant': {
    title: 'Ассистент',
    subtitle: 'Вопрос о доме, разовая команда или правило уровня дома в одном окне',
  },
  '/uk/incidents': { title: 'Инциденты', subtitle: 'Уровни: 0 журнал, 3 критично, заявка сразу' },
  '/uk/tickets': { title: 'Заявки', subtitle: 'Очередь подрядчиков, сроки по договору и источник заявки' },
  '/uk/devices': { title: 'Устройства', subtitle: 'Датчики дома и квартиры: добавить, изменить, создать свой тип' },
  '/uk/rules': { title: 'Правила', subtitle: 'Сценарии «когда, если, то»: включить, изменить, создать новый' },
  '/uk/sandbox': { title: 'Песочница', subtitle: 'Эмуляторы Ujin: ручные воздействия и живая шина событий' },
}

type ManagerAppProps = {
  path: string
  demo: boolean
}

export function ManagerApp({ path, demo }: ManagerAppProps) {
  const devices = useStore((state) => state.devices)
  const events = useStore((state) => state.events)
  const dispatch = useDispatchData(demo)
  const head = TITLES[path] ?? TITLES['/uk']
  const openIncidents = dispatch.tickets.filter((ticket) => ticket.status === 'draft').length

  let page
  if (path === '/uk/assistant') page = <AssistantPage />
  else if (path === '/uk/incidents') page = <IncidentsPage dispatch={dispatch} />
  else if (path === '/uk/tickets') page = <TicketsPage dispatch={dispatch} />
  else if (path === '/uk/devices') page = <DevicesPage devices={devices} />
  else if (path === '/uk/rules') page = <RulesPage devices={devices} />
  else if (path === '/uk/sandbox') page = <SandboxPage devices={devices} events={events} />
  else page = <DashboardPage devices={devices} dispatch={dispatch} />

  return (
    <div className="relative flex h-screen overflow-hidden bg-base text-ink">
      <Aurora />
      <Sidebar path={path} drafts={openIncidents} />
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar title={head.title} subtitle={head.subtitle} demo={demo} />
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">{page}</div>
      </main>
    </div>
  )
}
