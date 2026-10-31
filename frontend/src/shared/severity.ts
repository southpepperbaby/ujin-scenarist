import type { IconName } from './ui/Icon'

export type SeverityStyle = {
  /** Уровень политики автодиспетчера: 0 — журнал, 3 — критично (docs/concept.md). */
  level: number
  label: string
  short: string
  text: string
  bg: string
  border: string
  icon: IconName
}

/** Классы заданы литералами: Tailwind не видит динамически собранные имена. */
export const LEVELS: SeverityStyle[] = [
  {
    level: 0,
    label: 'Информация',
    short: 'ИНФО',
    text: 'text-sev-info',
    bg: 'bg-sev-info-soft',
    border: 'border-sev-info/35',
    icon: 'battery',
  },
  {
    level: 1,
    label: 'Минор',
    short: 'МИНОР',
    text: 'text-sev-minor',
    bg: 'bg-sev-minor-soft',
    border: 'border-sev-minor/35',
    icon: 'bulb',
  },
  {
    level: 2,
    label: 'Мажор',
    short: 'МАЖОР',
    text: 'text-sev-major',
    bg: 'bg-sev-major-soft',
    border: 'border-sev-major/35',
    icon: 'alert',
  },
  {
    level: 3,
    label: 'Критично',
    short: 'КРИТ',
    text: 'text-sev-crit',
    bg: 'bg-sev-crit-soft',
    border: 'border-sev-crit/35',
    icon: 'droplet',
  },
]

export function levelStyle(level: number | null | undefined): SeverityStyle {
  return LEVELS[Math.min(Math.max(level ?? 0, 0), LEVELS.length - 1)]
}

/** Уровень уведомления движка (info / warning / critical) в ту же шкалу. */
export function levelOfNotice(level: string): number {
  if (level === 'critical') return 3
  if (level === 'warning') return 2
  return 0
}
