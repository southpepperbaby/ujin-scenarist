import { navigate } from '../../app/routing'
import { Icon, type IconName } from '../../shared/ui/Icon'

type Tab = { to: string; label: string; icon: IconName; match: string }

const TABS: Tab[] = [
  { to: '/resident', label: 'Дом', icon: 'home', match: '/resident' },
  { to: '/resident/scenarios', label: 'Сценарии', icon: 'bolt', match: '/resident/scenarios' },
  { to: '/resident/alerts', label: 'События', icon: 'bell', match: '/resident/alerts' },
  { to: '/resident/profile', label: 'Профиль', icon: 'user', match: '/resident/profile' },
]

type TabBarProps = {
  path: string
  unread: number
}

function isActive(path: string, tab: Tab): boolean {
  if (tab.match === '/resident') return path === '/resident'
  return path.startsWith(tab.match)
}

export function TabBar({ path, unread }: TabBarProps) {
  return (
    <nav className="glass glass-strong flex shrink-0 rounded-none border-x-0 border-b-0 px-2 pt-2 pb-3">
      {TABS.map((tab) => {
        const active = isActive(path, tab)
        return (
          <button
            key={tab.to}
            type="button"
            onClick={() => navigate(tab.to)}
            className={`press relative flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition ${
              active ? 'text-accent' : 'text-ink-mute hover:text-ink-dim'
            }`}
          >
            <Icon name={tab.icon} size={22} />
            {tab.label}
            {tab.icon === 'bell' && unread > 0 && (
              <span className="absolute top-0.5 right-1/2 translate-x-4 rounded-full bg-sev-crit px-1.5 text-[10px] font-semibold text-white">
                {unread}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
