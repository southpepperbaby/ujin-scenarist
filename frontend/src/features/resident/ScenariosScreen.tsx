import { useState } from 'react'

import { navigate } from '../../app/routing'
import { useStore } from '../../store'
import { Chip } from '../../shared/ui/Chip'
import { Icon } from '../../shared/ui/Icon'
import { ScenarioCard } from './ScenarioCard'

type Filter = 'all' | 'on' | 'off'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'on', label: 'Включены' },
  { key: 'off', label: 'Черновики' },
]

export function ScenariosScreen() {
  const rules = useStore((state) => state.rules).filter((rule) => rule.owner === 'resident')
  const [filter, setFilter] = useState<Filter>('all')

  const visible = rules.filter((rule) => {
    if (filter === 'on') return rule.enabled
    if (filter === 'off') return !rule.enabled
    return true
  })

  return (
    <div className="space-y-5 px-5 pt-4 pb-8">
      <header>
        <h1 className="text-2xl font-semibold">Сценарии</h1>
        <p className="mt-1 text-[13px] text-ink-mute">
          Правило проверяется линтером и прогоняется на эмуляторах до включения.
        </p>
      </header>

      <button
        type="button"
        onClick={() => navigate('/resident/new')}
        className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent-soft to-surface p-4 text-left"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-ink">
          <Icon name="spark" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Описать правило словами</span>
          <span className="block text-[12px] text-ink-dim">«Если ночью протечка — перекрой воду»</span>
        </span>
        <Icon name="chevronRight" size={18} className="shrink-0 text-ink-mute" />
      </button>

      <div className="flex gap-2">
        {FILTERS.map((item) => (
          <Chip key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>
            {item.label}
          </Chip>
        ))}
      </div>

      <div className="space-y-2.5">
        {visible.map((rule) => (
          <ScenarioCard key={rule.id} rule={rule} />
        ))}
        {visible.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-[13px] text-ink-mute">
            Здесь пока пусто. Опишите первое правило словами.
          </p>
        )}
      </div>
    </div>
  )
}
