import { href, inSection } from '../../app/routing'
import { Icon } from '../../shared/ui/Icon'
import { NAV_ITEMS } from './nav'

type SidebarProps = {
  path: string
  /** Заявки-черновики: их должен подтвердить человек. */
  drafts: number
  /** Критичные инциденты, по которым ещё нет заявки. */
  critical: number
}

export function Sidebar({ path, drafts, critical }: SidebarProps) {
  const badges: Record<string, number> = { '/uk/tickets': drafts, '/uk/incidents': critical }
  return (
    <aside className="glass glass-strong relative z-10 flex w-16 shrink-0 flex-col rounded-none border-y-0 border-l-0 lg:w-[232px]">
      <div className="flex items-center gap-2.5 px-3.5 py-5 lg:px-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-ink">
          <Icon name="spark" size={20} />
        </span>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold leading-tight">HOMIE AI</p>
          <p className="text-caption text-ink-mute">кабинет УК</p>
        </div>
      </div>

      <nav aria-label="Разделы кабинета" className="flex-1 space-y-1 px-2 lg:px-3">
        {NAV_ITEMS.map((item) => {
          const active = item.to === '/uk' ? path === '/uk' : inSection(path, item.to)
          const badge = badges[item.to] ?? 0
          return (
            <a
              key={item.to}
              href={href(item.to)}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className={`press relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active ? 'bg-select font-semibold text-select-ink' : 'text-ink-dim hover:bg-raised/60 hover:text-ink'
              }`}
            >
              <Icon name={item.icon} size={18} />
              <span className="hidden flex-1 text-left lg:inline">{item.label}</span>
              {badge > 0 && (
                <span className="tabular absolute top-0.5 right-0.5 rounded-full bg-sev-crit px-1.5 py-0.5 text-micro font-semibold text-white lg:static">
                  {badge}
                  <span className="sr-only"> требуют внимания</span>
                </span>
              )}
            </a>
          )
        })}
      </nav>

      <a
        href={href('/')}
        title="Сменить роль"
        className="m-2 flex items-center gap-3 lg:m-3 rounded-xl px-3 py-2.5 text-sm text-ink-mute transition hover:bg-raised hover:text-ink"
      >
        <Icon name="logout" size={18} />
        <span className="hidden lg:inline">Сменить роль</span>
      </a>
    </aside>
  )
}
