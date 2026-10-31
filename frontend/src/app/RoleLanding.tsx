import { navigate } from './routing'
import { Aurora } from '../shared/ui/Aurora'
import { Glass } from '../shared/ui/Glass'
import { Icon } from '../shared/ui/Icon'

type RoleCardProps = {
  title: string
  subtitle: string
  points: string[]
  to: string
  accent: boolean
  index: number
}

function RoleCard({ title, subtitle, points, to, accent, index }: RoleCardProps) {
  return (
    <div className="rise" style={{ '--i': index } as React.CSSProperties}>
      <Glass tone={accent ? 'accent' : 'plain'} className="group h-full p-7" onClick={() => navigate(to)}>
        <div className="flex items-center justify-between">
          <span
            className={`flex size-12 items-center justify-center rounded-2xl ${
              accent ? 'bg-accent text-accent-ink' : 'bg-raised/70 text-ink-dim'
            }`}
          >
            <Icon name={accent ? 'home' : 'building'} size={24} />
          </span>
          <Icon
            name="arrowRight"
            size={22}
            className="text-ink-mute transition group-hover:translate-x-1 group-hover:text-accent"
          />
        </div>
        <div className="mt-5">
          <h2 className="text-xl">{title}</h2>
          <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
        </div>
        <ul className="mt-5 space-y-1.5 text-sm text-ink-mute">
          {points.map((point) => (
            <li key={point} className="flex gap-2">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
              {point}
            </li>
          ))}
        </ul>
      </Glass>
    </div>
  )
}

export function RoleLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora intensity="bold" />
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-10 px-6 py-16">
        <header className="rise">
          <p className="text-sm font-medium tracking-wide text-accent">UJIN OS · ERRD TEAM</p>
          <h1 className="mt-3 text-4xl">HOMIE AI</h1>
          <p className="mt-3 max-w-xl text-ink-dim">
            Редактор сценариев умного дома: LLM пишет, Jev судит, эмулятор проверяет, движок исполняет.
            Один продукт, две роли.
          </p>
        </header>
        <div className="grid gap-5 sm:grid-cols-2">
          <RoleCard
            accent
            index={1}
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
            index={2}
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
    </div>
  )
}
