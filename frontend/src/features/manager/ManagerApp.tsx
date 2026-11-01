import { useState } from 'react'

import { useStore } from '../../store'
import { useDispatchData } from '../../shared/use-dispatch'
import { AssistantPage } from './AssistantPage'
import { CommandPalette } from './CommandPalette'
import { DashboardPage } from './DashboardPage'
import { DevicesPage } from './DevicesPage'
import { IncidentsPage } from './IncidentsPage'
import { navFor } from './nav'
import { RulesPage } from './RulesPage'
import { SandboxPage } from './SandboxPage'
import { Sidebar } from './Sidebar'
import { TicketsPage } from './TicketsPage'
import { TopBar } from './TopBar'
import { UjinPage } from './UjinPage'

type ManagerAppProps = {
  path: string
  demo: boolean
}

/**
 * Кабинет УК. Подписан только на устройства: события шины и телеметрию читает песочница сама,
 * иначе каждый тик датчика перерисовывал бы все страницы кабинета.
 * Фон плотный, без подсветки: на экране диспетчера много текста, ему нужен спокойный контраст.
 */
export function ManagerApp({ path, demo }: ManagerAppProps) {
  const devices = useStore((state) => state.devices)
  const dispatch = useDispatchData(demo)
  const [palette, setPalette] = useState(false)
  const head = navFor(path)
  const drafts = dispatch.tickets.filter((ticket) => ticket.status === 'draft').length
  const critical = dispatch.incidents.filter(
    (incident) => (incident.verdict?.level ?? 0) >= 3 && incident.status !== 'logged' && !incident.ticket_id,
  ).length

  let page
  if (path === '/uk/assistant') page = <AssistantPage />
  else if (path === '/uk/incidents') page = <IncidentsPage dispatch={dispatch} />
  else if (path === '/uk/tickets') page = <TicketsPage dispatch={dispatch} devices={devices} />
  else if (path === '/uk/devices') page = <DevicesPage devices={devices} />
  else if (path === '/uk/rules') page = <RulesPage devices={devices} />
  else if (path === '/uk/sandbox') page = <SandboxPage devices={devices} />
  else if (path === '/uk/ujin') page = <UjinPage />
  else page = <DashboardPage devices={devices} dispatch={dispatch} />

  return (
    <div className="relative flex h-dvh overflow-hidden bg-canvas text-ink">
      <Sidebar path={path} drafts={drafts} critical={critical} />
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar title={head.title} subtitle={head.subtitle} demo={demo} onSearch={() => setPalette(true)} />
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">{page}</div>
      </main>
      <CommandPalette open={palette} onOpenChange={setPalette} devices={devices} incidents={dispatch.incidents} />
    </div>
  )
}
