import { useState } from 'react'

import type { Incident } from '../../api'
import type { DispatchData } from '../../shared/use-dispatch'
import { Chip } from '../../shared/ui/Chip'
import { IncidentRow } from './IncidentRow'
import { Panel } from './Panel'

/** Критичный — уровень 3: автодиспетчер шлёт заявку сразу. Остальное — не критичное. */
const CRITICAL_LEVEL = 3

type Filter = 'all' | 'critical' | 'other'

const FILTERS: { value: Filter; label: string; empty: string }[] = [
  { value: 'all', label: 'Все', empty: 'Инцидентов нет.' },
  { value: 'critical', label: 'Критичные', empty: 'Критичных инцидентов нет.' },
  { value: 'other', label: 'Не критичные', empty: 'Не критичных инцидентов нет.' },
]

function matches(incident: Incident, filter: Filter): boolean {
  if (filter === 'all') return true
  const critical = (incident.verdict?.level ?? 0) >= CRITICAL_LEVEL
  return filter === 'critical' ? critical : !critical
}

export function IncidentsPage({ dispatch }: { dispatch: DispatchData }) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = [...dispatch.incidents].reverse().filter((incident) => matches(incident, filter))
  const current = FILTERS.find((item) => item.value === filter) ?? FILTERS[0]

  return (
    <div className="space-y-4 px-7 py-6">
      <div className="flex gap-2">
        {FILTERS.map((item) => (
          <Chip key={item.value} active={filter === item.value} onClick={() => setFilter(item.value)}>
            {item.label}
          </Chip>
        ))}
      </div>

      <Panel title={`Инциденты · ${visible.length}`}>
        {visible.map((incident) => (
          <IncidentRow key={incident.id} incident={incident} />
        ))}
        {visible.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-ink-mute">{current.empty}</p>
        )}
      </Panel>
    </div>
  )
}
