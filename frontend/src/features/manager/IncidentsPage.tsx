import { useState } from 'react'

import { LEVELS } from '../../shared/severity'
import type { DispatchData } from '../../shared/use-dispatch'
import { Chip } from '../../shared/ui/Chip'
import { IncidentRow } from './IncidentRow'
import { Panel } from './Panel'

export function IncidentsPage({ dispatch }: { dispatch: DispatchData }) {
  const [level, setLevel] = useState<number | null>(null)
  const visible = [...dispatch.incidents]
    .reverse()
    .filter((incident) => level === null || (incident.verdict?.level ?? 0) === level)

  return (
    <div className="space-y-4 px-7 py-6">
      <div className="flex gap-2">
        <Chip active={level === null} onClick={() => setLevel(null)}>
          Все уровни
        </Chip>
        {LEVELS.map((item) => (
          <Chip key={item.level} active={level === item.level} onClick={() => setLevel(item.level)}>
            {item.level} · {item.label}
          </Chip>
        ))}
      </div>

      <Panel title={`Инциденты · ${visible.length}`}>
        {visible.map((incident) => (
          <IncidentRow key={incident.id} incident={incident} />
        ))}
        {visible.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-ink-mute">На этом уровне инцидентов нет.</p>
        )}
      </Panel>
    </div>
  )
}
