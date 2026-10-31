/** Форматирование значений для интерфейса: время, проценты, сроки SLA. */

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

export function formatClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/** Время с датой, когда это не сегодня: вчерашнее критичное не должно выглядеть свежим. */
export function formatWhen(ts: number, now: number = Date.now()): string {
  const date = new Date(ts * 1000)
  const today = new Date(now)
  const clock = formatClock(ts)
  if (date.toDateString() === today.toDateString()) return clock
  const yesterday = new Date(now - 86_400_000)
  if (date.toDateString() === yesterday.toDateString()) return `вчера, ${clock}`
  return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${clock}`
}

export function formatClockSeconds(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 100)}%`
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const rest = minutes % MINUTES_PER_HOUR
  if (hours === 0) return `${rest} мин`
  if (rest === 0) return `${hours} ч`
  return `${hours} ч ${rest} мин`
}

/** Остаток срока по договору: «осталось 1 ч 14 мин» или «просрочено на 20 мин». */
export function formatSlaDue(due: number | null, now: number = Date.now()): string {
  if (due === null) return 'срок не задан'
  const minutes = Math.round((due - now / 1000) / SECONDS_PER_MINUTE)
  if (minutes < 0) return `просрочено на ${formatDuration(-minutes)}`
  return `осталось ${formatDuration(minutes)}`
}

export function isOverdue(due: number | null, now: number = Date.now()): boolean {
  return due !== null && due < now / 1000
}
