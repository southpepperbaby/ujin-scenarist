import { navigate } from '../../app/routing'
import { Icon, type IconName } from '../../shared/ui/Icon'

type NavItem = { to: string; label: string; icon: IconName; badge?: number }

type SidebarProps = {
  path: string
  /** Заявки-черновики: их должен подтвердить человек. */
  drafts: number
}

function items(drafts: number): NavItem[] {
  return [
    { to: '/uk', label: 'Дашборд', icon: 'grid' },
    { to: '/uk/incidents', label: 'Инциденты', icon: 'alert' },
    { to: '/uk/tickets', label: 'Заявки', icon: 'wrench', badge: drafts },
    { to: '/uk/devices', label: 'Устройства', icon: 'building' },
    { to: '/uk/sandbox', label: 'Песочница', icon: 'play' },
    { to: '/studio', label: 'Студия правил', icon: 'sliders' },
  ]
}

export function Sidebar({ path, drafts }: SidebarProps) {
  return (
    <aside className="glass glass-strong relative z-10 flex w-[232px] shrink-0 flex-col rounded-none border-y-0 border-l-0">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-ink">
          <Icon name="spark" size={20} />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Сценарист</p>
          <p className="text-[11px] text-ink-mute">кабинет УК</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items(drafts).map((item) => {
          const active = item.to === '/uk' ? path === '/uk' : path.startsWith(item.to)
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(item.to)}
              className={`press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_28%,transparent)]' : 'text-ink-dim hover:bg-raised/60 hover:text-ink'
              }`}
            >
              <Icon name={item.icon} size={18} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-sev-crit px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {item.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <button
        type="button"
        onClick={() => navigate('/')}
        className="m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-mute transition hover:bg-raised hover:text-ink"
      >
        <Icon name="logout" size={18} />
        Сменить роль
      </button>
    </aside>
  )
}
