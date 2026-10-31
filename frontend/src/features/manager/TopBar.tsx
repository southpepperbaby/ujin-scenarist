import { Icon } from '../../shared/ui/Icon'

type TopBarProps = {
  title: string
  subtitle: string
  demo: boolean
}

export function TopBar({ title, subtitle, demo }: TopBarProps) {
  return (
    <header className="flex items-center gap-4 border-b border-line px-7 py-4">
      <div className="flex-1">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-[13px] text-ink-mute">{subtitle}</p>
      </div>

      {demo && (
        <span className="rounded-lg border border-line bg-raised px-2.5 py-1 text-[12px] text-ink-mute">
          демо-данные
        </span>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink-mute">
        <Icon name="search" size={16} />
        Поиск по дому
      </div>
      <span className="flex size-9 items-center justify-center rounded-xl bg-raised text-ink-dim">
        <Icon name="user" size={18} />
      </span>
    </header>
  )
}
