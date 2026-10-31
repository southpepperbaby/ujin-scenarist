import { navigate } from '../../app/routing'
import type { Rule } from '../../api'
import { useStore } from '../../store'
import { RULE_STATUS } from '../../shared/ticket-status'
import { Glass } from '../../shared/ui/Glass'
import { Icon } from '../../shared/ui/Icon'
import { RuleFlow } from '../../shared/rule/RuleFlow'

type ScenarioCardProps = {
  rule: Rule
  index: number
}

export function ScenarioCard({ rule, index }: ScenarioCardProps) {
  const devices = useStore((state) => state.devices)
  const status = RULE_STATUS[rule.status]

  return (
    <div className="rise" style={{ '--i': index } as React.CSSProperties}>
      <Glass className="p-4" onClick={() => navigate(`/resident/scenarios/${rule.id}`)}>
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{rule.title}</p>
            <p className="mt-0.5 text-[12px] text-ink-mute">
              {status.label}
              {!rule.enabled && ' · выключено'}
            </p>
          </div>
          <Icon name="chevronRight" size={18} className="mt-0.5 shrink-0 text-ink-mute" />
        </div>
        <RuleFlow rule={rule} devices={devices} />
      </Glass>
    </div>
  )
}
