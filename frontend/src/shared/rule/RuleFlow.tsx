import type { Device, Rule } from '../../api'
import { ruleLines } from './rule-lines'

type Step = { label: string; text: string }

type RuleFlowProps = {
  rule: Rule
  devices: Device[]
}

/** Правило схемой: если → и → то, шаги связаны линией сверху вниз. */
export function RuleFlow({ rule, devices }: RuleFlowProps) {
  const lines = ruleLines(rule, devices)
  const steps: Step[] = [
    ...lines.when.map((text) => ({ label: 'ЕСЛИ', text })),
    ...lines.conditions.map((text) => ({ label: 'И', text })),
    ...lines.actions.map((text, index) => ({ label: index === 0 ? 'ТО' : 'И', text })),
  ]

  return (
    <ol className="relative space-y-2">
      <span className="absolute top-3 bottom-3 left-[21px] w-px bg-line-strong" aria-hidden="true" />
      {steps.map((step, index) => (
        <li key={`${step.label}-${index}`} className="relative flex items-start gap-2.5">
          <span className="z-[1] w-11 shrink-0 rounded-md bg-accent-soft py-1 text-center text-micro font-semibold tracking-widest text-accent">
            {step.label}
          </span>
          <span className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-body leading-snug text-ink">
            {step.text}
          </span>
        </li>
      ))}
    </ol>
  )
}
