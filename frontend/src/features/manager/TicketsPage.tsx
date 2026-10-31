import { useState } from 'react'

import type { Device } from '../../api'
import { formatDuration } from '../../shared/format'
import { Button } from '../../shared/ui/Button'
import type { DispatchData } from '../../shared/use-dispatch'
import { Panel } from './Panel'
import { PolicyPanel } from './PolicyPanel'
import { TicketFormModal } from './TicketFormModal'
import { TicketRow } from './TicketRow'

export function TicketsPage({ dispatch, devices }: { dispatch: DispatchData; devices: Device[] }) {
  const { tickets, contractors, categories, reload } = dispatch
  const [creating, setCreating] = useState(false)

  return (
    <div className="grid gap-5 px-7 py-6 2xl:grid-cols-[1.7fr_1fr]">
      <div className="space-y-4">
        <Panel title={`Заявки подрядчикам · ${tickets.length}`}>
          {[...tickets].reverse().map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} categories={categories} onChanged={reload} />
          ))}
          {tickets.length === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-ink-mute">Заявок пока нет.</p>
          )}
        </Panel>
        <Button variant="bright" icon="plus" onClick={() => setCreating(true)}>
          Создать заявку
        </Button>
      </div>

      <div className="space-y-5">
        <PolicyPanel categories={categories} />
        <Panel title="Пул подрядчиков">
          {contractors.map((contractor) => (
            <div
              key={contractor.id}
              className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{contractor.name}</p>
                <p className="truncate text-[12px] text-ink-mute">
                  {categories[contractor.category] ?? contractor.category} · {contractor.hours}
                </p>
              </div>
              <span className="shrink-0 text-[12px] text-ink-dim">{formatDuration(contractor.sla_minutes)}</span>
              <span className="hidden shrink-0 font-mono text-[12px] text-ink-mute xl:block">
                {contractor.phone}
              </span>
            </div>
          ))}
        </Panel>
      </div>

      {creating && (
        <TicketFormModal
          devices={devices}
          contractors={contractors}
          categories={categories}
          onClose={() => setCreating(false)}
          onCreated={reload}
        />
      )}
    </div>
  )
}
