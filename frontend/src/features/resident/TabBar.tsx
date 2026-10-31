import { href, inSection } from '../../app/routing'
import { Icon, type IconName } from '../../shared/ui/Icon'

type Tab = { to: string; label: string; icon: IconName }

const TABS: Tab[] = [
  { to: '/resident', label: 'Дом', icon: 'home' },
  { to: '/resident/scenarios', label: 'Сценарии', icon: 'bolt' },
  { to: '/resident/alerts', label: 'События', icon: 'bell' },
  { to: '/resident/profile', label: 'Профиль', icon: 'user' },
]

type TabBarProps = {
  path: string
  unread: number
}

function isActive(path: string, tab: Tab): boolean {
  if (tab.to === '/resident') return path === '/resident'
  return inSection(path, tab.to)
}

export function TabBar({ path, unread }: TabBarProps) {
  return (
    <nav aria-label="Разделы" className="glass glass-strong flex shrink-0 rounded-none border-x-0 border-b-0 px-2 pt-2 pb-3">
      {TABS.map((tab) => {
        const active = isActive(path, tab)
        const badge = tab.icon === 'bell' && unread > 0
        return (
          <a
            key={tab.to}
            href={href(tab.to)}
            aria-current={active ? 'page' : undefined}
            className={`press relative flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-caption font-medium transition ${
              active ? 'text-accent' : 'text-ink-mute hover:text-ink-dim'
            }`}
          >
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${active ? 'bg-accent-soft' : ''}`}>
              <Icon name={tab.icon} size={22} />
            </span>
            {tab.label}
            {badge && (
              <span className="tabular absolute top-0.5 right-1/2 translate-x-5 rounded-full bg-sev-crit px-1.5 text-micro font-semibold text-white">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> непрочитанных</span>
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
}
