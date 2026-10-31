import { useCallback, useState } from 'react'

import type { Device } from '../../api'
import { useAction } from '../../shared/actions'
import { formatDuration } from '../../shared/format'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonList } from '../../shared/ui/Skeleton'
import type { DispatchData } from '../../shared/use-dispatch'
import { useNow } from '../../shared/use-now'
import { Panel } from './Panel'
import { PolicyPanel } from './PolicyPanel'
import { TicketFormModal } from './TicketFormModal'
import { TicketRow } from './TicketRow'

export function TicketsPage({ dispatch, devices }: { dispatch: DispatchData; devices: Device[] }) {
  const { tickets, contractors, categories, reload, loaded } = dispatch
  const [creating, setCreating] = useState(false)
  // Сроки SLA пересчитываются раз в 30 секунд, без перезагрузки страницы.
  const now = useNow()
  const create = useCallback(() => setCreating(true), [])
  useAction('new-ticket', create)

  return (
    <div className="grid gap-5 px-7 py-6 2xl:grid-cols-[1.7fr_1fr]">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="bright" icon="plus" onClick={create}>
            Создать заявку
          </Button>
          <span className="text-meta text-ink-mute">или Ctrl K → «заявка»</span>
        </div>
        <Panel title={`Заявки подрядчикам · ${tickets.length}`}>
          {!loaded && (
            <div className="p-4">
              <SkeletonList count={4} className="h-14" />
            </div>
          )}
          {[...tickets].reverse().map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} categories={categories} onChanged={reload} now={now} />
          ))}
          {loaded && tickets.length === 0 && (
            <EmptyState
              icon="wrench"
              title="Заявок пока нет"
              hint="Автодиспетчер заведёт заявку сам, когда датчик сообщит о проблеме. Обход или звонок жителя — заведите вручную."
              action={
                <Button variant="primary" icon="plus" onClick={create}>
                  Создать заявку
                </Button>
              }
            />
          )}
        </Panel>
      </div>

      <div className="space-y-5">
        <PolicyPanel categories={categories} />
        <Panel title="Пул подрядчиков">
          {contractors.map((contractor) => (
            <div key={contractor.id} className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{contractor.name}</p>
                <p className="truncate text-meta text-ink-mute">
                  {categories[contractor.category] ?? contractor.category} · {contractor.hours}
                </p>
              </div>
              <span className="tabular shrink-0 text-meta text-ink-dim" title="Время реакции по договору">
                {formatDuration(contractor.sla_minutes)}
              </span>
              <a
                href={`tel:${contractor.phone.replace(/[^\d+]/g, '')}`}
                className="hidden shrink-0 font-mono text-meta text-ink-mute hover:text-accent xl:block"
              >
                {contractor.phone}
              </a>
            </div>
          ))}
          {loaded && contractors.length === 0 && (
            <p className="px-5 py-6 text-center text-body text-ink-mute">Подрядчиков в пуле нет.</p>
          )}
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
