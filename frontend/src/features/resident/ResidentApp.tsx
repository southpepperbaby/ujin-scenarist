import { useStore } from '../../store'
import { AlertsScreen } from './AlertsScreen'
import { HomeScreen } from './HomeScreen'
import { PhoneShell } from './PhoneShell'
import { ProfileScreen } from './ProfileScreen'
import { ScenarioComposer } from './ScenarioComposer'
import { ScenarioDetailScreen } from './ScenarioDetailScreen'
import { ScenariosScreen } from './ScenariosScreen'
import { TabBar } from './TabBar'

function NotFound() {
  return <p className="px-5 py-10 text-center text-[13px] text-ink-mute">Правило не найдено.</p>
}

type ResidentAppProps = {
  path: string
  demo: boolean
}

export function ResidentApp({ path, demo }: ResidentAppProps) {
  const rules = useStore((state) => state.rules)
  const notifications = useStore((state) => state.notifications)
  const unread = notifications.filter((notice) => notice.target === 'resident').length

  const detailId = path.startsWith('/resident/scenarios/') ? path.split('/')[3] : null
  const rule = detailId ? rules.find((item) => item.id === detailId) : null

  let screen
  if (detailId) screen = rule ? <ScenarioDetailScreen rule={rule} /> : <NotFound />
  else if (path === '/resident/scenarios') screen = <ScenariosScreen />
  else if (path === '/resident/new') screen = <ScenarioComposer />
  else if (path === '/resident/alerts') screen = <AlertsScreen />
  else if (path === '/resident/profile') screen = <ProfileScreen />
  else screen = <HomeScreen demo={demo} />

  return <PhoneShell tabBar={<TabBar path={path} unread={unread} />}>{screen}</PhoneShell>
}
