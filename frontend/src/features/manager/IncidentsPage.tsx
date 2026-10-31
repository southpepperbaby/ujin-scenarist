import { useEffect, useRef, useState } from 'react'

import type { Incident } from '../../api'
import type { DispatchData } from '../../shared/use-dispatch'
import { Chip } from '../../shared/ui/Chip'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonList } from '../../shared/ui/Skeleton'
import { IncidentRow } from './IncidentRow'
import { Panel } from './Panel'

/** Критичный — уровень 3: автодиспетчер шлёт заявку сразу. Остальное — не критичное. */
const CRITICAL_LEVEL = 3

type Filter = 'all' | 'critical' | 'other'

const FILTERS: { value: Filter; label: string; empty: string }[] = [
  { value: 'all', label: 'Все', empty: 'Инцидентов нет' },
  { value: 'critical', label: 'Критичные', empty: 'Критичных инцидентов нет' },
  { value: 'other', label: 'Не критичные', empty: 'Не критичных инцидентов нет' },
]

function matches(incident: Incident, filter: Filter): boolean {
  if (filter === 'all') return true
  const critical = (incident.verdict?.level ?? 0) >= CRITICAL_LEVEL
  return filter === 'critical' ? critical : !critical
}

/** Клавиши набираются не в поле ввода: J/K в текстовом поле должны оставаться буквами. */
function typingInField(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null
  return Boolean(node?.closest('input, textarea, select, [contenteditable="true"], dialog, [cmdk-root]'))
}

export function IncidentsPage({ dispatch }: { dispatch: DispatchData }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [cursor, setCursor] = useState(-1)
  const rows = useRef<(HTMLElement | null)[]>([])
  const visible = [...dispatch.incidents].reverse().filter((incident) => matches(incident, filter))
  const current = FILTERS.find((item) => item.value === filter) ?? FILTERS[0]!
  const count = visible.length

  // J/K — по ленте вниз и вверх, как в почте и Linear; Enter раскрывает подробности.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typingInField(event.target)) return
      const key = event.key.toLowerCase()
      if (key !== 'j' && key !== 'k') return
      event.preventDefault()
      setCursor((index) => {
        const next = key === 'j' ? Math.min(index + 1, count - 1) : Math.max(index - 1, 0)
        rows.current[next]?.querySelector('button')?.focus()
        rows.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count])

  return (
    <div className="space-y-4 px-7 py-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтр инцидентов">
        {FILTERS.map((item) => (
          <Chip
            key={item.value}
            active={filter === item.value}
            onClick={() => {
              setFilter(item.value)
              setCursor(-1)
            }}
          >
            {item.label}
          </Chip>
        ))}
        <span className="ml-auto hidden items-center gap-1.5 text-meta text-ink-mute md:flex">
          <span className="kbd">J</span>
          <span className="kbd">K</span>
          по ленте
        </span>
      </div>

      <Panel title={`Инциденты · ${visible.length}`}>
        {!dispatch.loaded && (
          <div className="p-4">
            <SkeletonList count={5} className="h-16" />
          </div>
        )}
        {visible.map((incident, index) => (
          <IncidentRow
            key={incident.id}
            ref={(node) => {
              rows.current[index] = node
            }}
            incident={incident}
            selected={index === cursor}
            onFocus={() => setCursor(index)}
          />
        ))}
        {dispatch.loaded && visible.length === 0 && (
          <EmptyState
            icon="shield"
            title={current.empty}
            hint={filter === 'all' ? 'Как только датчик дома сообщит о проблеме, автодиспетчер разберёт её здесь.' : undefined}
          />
        )}
      </Panel>
    </div>
  )
}
