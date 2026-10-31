import type { Compiled, Confirmed } from '../../api'
import { Icon } from '../ui/Icon'

type StepState = 'wait' | 'active' | 'ok' | 'fail'

type PipelineProps = {
  busy: boolean
  result: Compiled | null
  checked: Confirmed | null
}

const DOT: Record<StepState, string> = {
  wait: 'border-line-strong text-ink-mute',
  active: 'border-accent text-accent',
  ok: 'border-ok bg-ok text-surface',
  fail: 'border-sev-crit bg-sev-crit text-surface',
}

/**
 * Конвейер правила на виду: модель собирает → линтер проверяет → эмулятор прогоняет на копии дома.
 * Состояние шагов берётся из реальных ответов (идёт запрос, есть lint, есть check), без таймеров.
 */
export function Pipeline({ busy, result, checked }: PipelineProps) {
  const compiling = busy && !result && !checked
  const lint = result?.lint ?? checked?.lint
  const confirming = busy && Boolean(result?.rule)

  const steps: { label: string; state: StepState; note?: string }[] = [
    {
      label: 'Модель собирает правило',
      state: compiling ? 'active' : result?.rule || checked ? 'ok' : result?.error ? 'fail' : 'wait',
    },
    {
      label: 'Линтер проверяет',
      state: !lint ? 'wait' : lint.ok ? 'ok' : 'fail',
      note: lint && !lint.ok ? `ошибок: ${lint.errors ?? lint.issues.length}` : undefined,
    },
    {
      label: 'Прогон на копии дома',
      state: confirming ? 'active' : !checked?.check ? 'wait' : checked.check.passed ? 'ok' : 'fail',
    },
  ]

  if (!busy && !result && !checked) return null

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-meta" aria-live="polite" aria-label="Ход проверки">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          {index > 0 && <span className="h-px w-4 bg-line-strong" aria-hidden="true" />}
          <span
            className={`flex size-5 items-center justify-center rounded-full border-2 ${DOT[step.state]} ${
              step.state === 'active' ? 'animate-pulse' : ''
            }`}
            aria-hidden="true"
          >
            {step.state === 'ok' && <Icon name="check" size={12} />}
            {step.state === 'fail' && <Icon name="close" size={12} />}
          </span>
          <span className={step.state === 'wait' ? 'text-ink-mute' : 'text-ink-dim'}>
            {step.label}
            {step.note && <span className="text-sev-crit"> · {step.note}</span>}
            <span className="sr-only">
              {step.state === 'ok' ? ' — готово' : step.state === 'fail' ? ' — не прошло' : step.state === 'active' ? ' — идёт' : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
