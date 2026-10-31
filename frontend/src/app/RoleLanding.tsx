import { navigate } from './routing'
import { Icon } from '../shared/ui/Icon'

type RoleCardProps = {
  title: string
  subtitle: string
  points: string[]
  to: string
  accent: boolean
}

function RoleCard({ title, subtitle, points, to, accent }: RoleCardProps) {
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`group flex w-full flex-col gap-5 rounded-3xl border p-7 text-left transition ${
        accent
          ? 'border-accent/40 bg-gradient-to-b from-accent-soft to-surface hover:border-accent'
          : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex size-12 items-center justify-center rounded-2xl ${
            accent ? 'bg-accent text-accent-ink' : 'bg-raised text-ink-dim'
          }`}
        >
          <Icon name={accent ? 'home' : 'building'} size={24} />
        </span>
        <Icon name="arrowRight" size={22} className="text-ink-mute transition group-hover:text-accent" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
      </div>
      <ul className="space-y-1.5 text-sm text-ink-mute">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
            {point}
          </li>
        ))}
      </ul>
    </button>
  )
}

export function RoleLanding() {
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-10 px-6 py-16">
      <header>
        <p className="text-sm font-medium tracking-wide text-accent">UJIN OS · ERRD TEAM</p>
        <h1 className="mt-3 text-4xl font-semibold">Сценарист</h1>
        <p className="mt-3 max-w-xl text-ink-dim">
          Редактор сценариев умного дома: LLM пишет, Jev судит, эмулятор проверяет, движок исполняет.
          Один продукт, две роли.
        </p>
      </header>
      <div className="grid gap-5 sm:grid-cols-2">
        <RoleCard
          accent
          title="Житель"
          subtitle="Мобильное приложение квартиры"
          to="/resident"
          points={[
            'Сценарии словами, без блок-схем',
            'Данные с датчиков в реальном времени',
            'Разбор, как устроено каждое правило',
            'Уведомления о проблемах в квартире',
          ]}
        />
        <RoleCard
          accent={false}
          title="Управляющая компания"
          subtitle="Диспетчерская на большом экране"
          to="/uk"
          points={[
            'Лента инцидентов по дому с уровнями',
            'Очередь заявок подрядчикам и SLA',
            'Состояние всех датчиков дома',
            'Песочница эмуляторов для проверки',
          ]}
        />
      </div>
    </div>
  )
}
