import { toggleTheme, useTheme } from '../../shared/use-theme'
import { Icon } from '../../shared/ui/Icon'

type TopBarProps = {
  title: string
  subtitle: string
  demo: boolean
  onSearch: () => void
}

export function TopBar({ title, subtitle, demo, onSearch }: TopBarProps) {
  const theme = useTheme()
  return (
    <header className="glass flex items-center gap-4 rounded-none border-x-0 border-t-0 px-7 py-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-title">{title}</h1>
        {subtitle && <p className="truncate text-body text-ink-mute">{subtitle}</p>}
      </div>

      {demo && (
        <span
          className="rounded-lg border border-sev-minor/30 bg-sev-minor-soft px-2.5 py-1 text-meta text-sev-minor"
          title="Бэкенд не отвечает: показан демо-набор, подключимся сами"
          role="status"
        >
          демо-данные
        </span>
      )}

      <button
        type="button"
        onClick={onSearch}
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-body text-ink-mute transition hover:border-line-strong hover:text-ink"
      >
        <Icon name="search" size={16} />
        <span className="hidden lg:inline">Поиск и команды</span>
        <span className="hidden items-center gap-0.5 lg:flex">
          <span className="kbd">Ctrl</span>
          <span className="kbd">K</span>
        </span>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
        className="flex size-9 items-center justify-center rounded-xl bg-raised text-ink-dim transition hover:text-ink"
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </button>
    </header>
  )
}
