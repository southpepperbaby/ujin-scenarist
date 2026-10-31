import type { ReactNode } from 'react'

import type { Compiled } from '../../api'
import { Button } from '../ui/Button'
import { Glass } from '../ui/Glass'
import { Icon } from '../ui/Icon'

type ConfirmCardProps = {
  result: Compiled
  busy: boolean
  onConfirm: () => void
  onRefine: () => void
  /** Дополнительная кнопка между «да» и «нет», например «Прогнать» у УК. */
  extra?: ReactNode
}

/**
 * Единый шаг проверки для жителя и УК. Пересказ приходит с бэкенда и строится из собранного JSON,
 * а не из ответа модели: человек подтверждает ровно то, что будет исполнено.
 */
export function ConfirmCard({ result, busy, onConfirm, onRefine, extra }: ConfirmCardProps) {
  if (!result.rule) return null
  const command = result.rule.trigger.device_id === '__now__'
  const issues = result.lint?.issues.filter((issue) => issue.level !== 'info') ?? []

  return (
    <Glass className="rise space-y-3 p-4">
      <p className="text-[11px] font-semibold tracking-widest text-ink-mute">
        {command ? 'БУДЕТ ВЫПОЛНЕНО СЕЙЧАС' : 'БУДЕТ ДОБАВЛЕНО ПРАВИЛО'}
      </p>
      <p className="text-[14px] leading-relaxed text-ink">{result.explanation}</p>

      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((issue) => (
            <li
              key={`${issue.code}-${issue.message}`}
              className={`flex gap-2 text-[12px] ${issue.level === 'error' ? 'text-sev-crit' : 'text-sev-minor'}`}
            >
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className={`flex flex-wrap gap-2.5 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        <Button variant="primary" icon="check" onClick={onConfirm}>
          Да, подтвердить
        </Button>
        {extra}
        <Button variant="ghost" onClick={onRefine}>
          Нет, дополнить промпт
        </Button>
      </div>
    </Glass>
  )
}
