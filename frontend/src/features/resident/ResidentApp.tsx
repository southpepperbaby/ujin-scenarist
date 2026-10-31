import { useEffect } from 'react'

import { inSection, tail } from '../../app/routing'
import { useStore } from '../../store'
import { AlertsScreen } from './AlertsScreen'
import { HomeScreen } from './HomeScreen'
import { PhoneShell } from './PhoneShell'
import { ProfileScreen } from './ProfileScreen'
import { ScenarioDetailScreen } from './ScenarioDetailScreen'
import { ScenariosScreen } from './ScenariosScreen'
import { TabBar } from './TabBar'

function Placeholder({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-body text-ink-mute">{text}</p>
}

type ResidentAppProps = {
  path: string
  demo: boolean
}

export function ResidentApp({ path, demo }: ResidentAppProps) {
  const rules = useStore((state) => state.rules)
  const loaded = useStore((state) => state.loaded)
  const markSeen = useStore((state) => state.markSeen)
  const unread = useStore(
    (state) => state.notifications.filter((notice) => notice.target === 'resident' && notice.ts > state.seenTs).length,
  )
  const onAlerts = path === '/resident/alerts'

  // Пока вкладка «События» открыта, всё пришедшее сразу считается прочитанным.
  const lastTs = useStore((state) => state.notifications.at(-1)?.ts ?? 0)
  useEffect(() => {
    if (onAlerts) markSeen()
  }, [onAlerts, lastTs, markSeen])

  const detailId = tail(path, '/resident/scenarios')
  const rule = detailId ? rules.find((item) => item.id === detailId) : null

  let screen
  if (detailId) {
    if (rule) screen = <ScenarioDetailScreen key={rule.id} rule={rule} />
    else screen = <Placeholder text={loaded ? 'Сценарий не найден.' : 'Загружаем сценарий…'} />
  } else if (inSection(path, '/resident/scenarios')) screen = <ScenariosScreen />
  else if (onAlerts) screen = <AlertsScreen demo={demo} />
  else if (path === '/resident/profile') screen = <ProfileScreen />
  else screen = <HomeScreen demo={demo} />

  return (
    <PhoneShell path={path} tabBar={<TabBar path={path} unread={unread} />}>
      {screen}
    </PhoneShell>
  )
}
