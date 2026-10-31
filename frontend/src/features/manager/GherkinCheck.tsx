import { useState } from 'react'

import { api, type GherkinReport, type Rule } from '../../api'
import { Button } from '../../shared/ui/Button'
import { Icon } from '../../shared/ui/Icon'
import { guard } from '../../store'

const STEP_STYLE: Record<string, string> = {
  passed: 'text-ok',
  failed: 'text-sev-crit',
  undefined: 'text-sev-minor',
  skipped: 'text-ink-mute',
}

/**
 * Проверка правила сценариями на русском Gherkin: бэкенд генерирует сценарии из правила
 * («срабатывает» и «устройство без связи»), гоняет их на копии дома и возвращает статус каждого шага.
 */
export function GherkinCheck({ rule }: { rule: Rule }) {
  const [report, setReport] = useState<GherkinReport | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    setReport((await guard(api.gherkin(rule))) ?? null)
    setBusy(false)
  }

  if (!report) {
    return (
      <Button variant="ghost" icon="shield" onClick={() => void run()}>
        {busy ? 'Проверяю…' : 'Проверить'}
      </Button>
    )
  }

  return (
    <div className="mt-3 w-full rounded-xl border border-line bg-canvas/40 p-3">
      <div className="flex items-center justify-between">
        <p className={`text-meta font-semibold ${report.passed ? 'text-ok' : 'text-sev-crit'}`}>
          Gherkin: {report.summary}
        </p>
        <button type="button" onClick={() => setReport(null)} className="text-meta text-ink-mute hover:text-ink">
          Скрыть
        </button>
      </div>
      {report.scenarios.map((scenario) => (
        <div key={scenario.name} className="mt-2">
          <p className="text-meta font-medium text-ink">Сценарий: {scenario.name}</p>
          <ul className="mt-1 space-y-0.5 font-mono text-caption">
            {scenario.steps.map((step) => (
              <li key={step.line} className={`flex gap-1.5 ${STEP_STYLE[step.status] ?? ''}`}>
                <Icon name={step.status === 'passed' ? 'check' : 'alert'} size={12} className="mt-0.5 shrink-0" />
                <span>
                  {step.keyword} {step.text}
                  {step.status !== 'passed' && step.detail && <span className="text-ink-mute">: {step.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
