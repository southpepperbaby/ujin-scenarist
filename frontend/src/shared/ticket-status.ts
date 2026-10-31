import type { Rule, TicketStatus } from '../api'

type Style = { label: string; className: string }

/** Статусы заявки совпадают со STATUS_TITLES бэкенда (backend/app/tickets.py). */
export const TICKET_STATUS: Record<TicketStatus, Style> = {
  draft: { label: 'ждёт подтверждения', className: 'bg-sev-minor-soft text-sev-minor' },
  new: { label: 'отправлена подрядчику', className: 'bg-sev-info-soft text-sev-info' },
  accepted: { label: 'принята', className: 'bg-accent-soft text-accent' },
  in_progress: { label: 'в работе', className: 'bg-sev-major-soft text-sev-major' },
  done: { label: 'выполнена', className: 'bg-ok-soft text-ok' },
  closed: { label: 'закрыта', className: 'bg-field text-ink-mute' },
  cancelled: { label: 'отменена', className: 'bg-field text-ink-mute' },
}

/** Жизненный цикл правила: черновик → линтер → прогон на эмуляторе → включено. */
export const RULE_STATUS: Record<Rule['status'], Style> = {
  draft: { label: 'Черновик', className: 'bg-field text-ink-mute' },
  checked: { label: 'Проверено линтером', className: 'bg-sev-info-soft text-sev-info' },
  tested: { label: 'Прогнано на эмуляторе', className: 'bg-accent-soft text-accent' },
  active: { label: 'Включено', className: 'bg-ok-soft text-ok' },
}
