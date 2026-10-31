import { navigate } from '../../app/routing'
import { Icon, type IconName } from '../../shared/ui/Icon'

type Row = { icon: IconName; label: string; value: string }

const ROWS: Row[] = [
  { icon: 'building', label: 'Адрес', value: 'ЖК «Северный», корп. 1 · кв. 2806' },
  { icon: 'grid', label: 'Устройства', value: 'квартира и общедомовое в одном приложении' },
  { icon: 'bolt', label: 'Правила', value: 'приоритет УК выше правил жителя' },
  { icon: 'shield', label: 'Данные для ИИ', value: 'обезличены, идентификаторы скрыты' },
  { icon: 'wrench', label: 'Управляющая компания', value: 'диспетчер 24/7' },
]

export function ProfileScreen() {
  return (
    <div className="space-y-5 px-5 pt-4 pb-8">
      <header className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-ink">
          <Icon name="user" size={26} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Житель · кв. 42</h1>
          <p className="text-[13px] text-ink-mute">Полный доступ к правилам квартиры</p>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {ROWS.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-center gap-3 px-4 py-3.5 ${index > 0 ? 'border-t border-line' : ''}`}
          >
            <Icon name={row.icon} size={18} className="shrink-0 text-ink-mute" />
            <span className="flex-1 text-[14px]">{row.label}</span>
            <span className="max-w-[55%] truncate text-right text-[13px] text-ink-mute">{row.value}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/uk')}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-line-strong"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-raised text-ink-dim">
          <Icon name="logout" size={18} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium">Перейти в кабинет УК</span>
          <span className="block text-[12px] text-ink-mute">Демо-переключение роли</span>
        </span>
        <Icon name="chevronRight" size={18} className="text-ink-mute" />
      </button>
    </div>
  )
}
