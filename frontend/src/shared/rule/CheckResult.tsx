import type { ReactNode } from 'react'

import type { CheckLine, Confirmed } from '../../api'
import { Glass } from '../ui/Glass'
import { Icon, type IconName } from '../ui/Icon'

const LINE: Record<CheckLine['kind'], { icon: IconName; color: string }> = {
  ok: { icon: 'check', color: 'text-ok' },
  warn: { icon: 'alert', color: 'text-sev-minor' },
  fail: { icon: 'close', color: 'text-sev-crit' },
}

/**
 * Итог «Да, подтвердить» для правила: что показал прогон на копии дома и включено ли правило.
 * Включается только правило, которое прошло линтер и прогон; иначе оно остаётся черновиком с причиной.
 */
export function CheckResult({ res, action }: { res: Confirmed; action?: ReactNode }) {
  const enabled = res.rule?.enabled ?? false
  const lintError = res.lint?.issues.find((issue) => issue.level === 'error')?.message
  return (
    <Glass tone="solid" className="rise space-y-3 p-4">
      <p className="text-caption font-semibold tracking-widest text-ink-mute">ПРОВЕРКА НА КОПИИ ДОМА</p>
      <p className="text-sm leading-relaxed text-ink">{res.explanation}</p>

      {lintError && (
        <p className="flex gap-2 text-body text-sev-crit">
          <Icon name="close" size={15} className="mt-0.5 shrink-0" />
          {lintError}
        </p>
      )}

      {res.check && (
        <ul className="space-y-1.5">
          {res.check.lines.map((line, index) => (
            <li key={`${index}-${line.text}`} className={`flex gap-2 text-body leading-snug ${LINE[line.kind].color}`}>
              <Icon name={LINE[line.kind].icon} size={15} className="mt-0.5 shrink-0" />
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-meta font-medium ${
            enabled ? 'bg-ok-soft text-ok' : 'bg-sev-minor-soft text-sev-minor'
          }`}
        >
          {enabled ? 'Правило включено' : 'Осталось черновиком'}
        </span>
        {action}
      </div>
    </Glass>
  )
}
