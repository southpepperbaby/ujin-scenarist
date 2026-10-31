import { navigate } from '../../app/routing'
import type { Rule } from '../../api'
import { ruleLines } from '../../shared/rule/rule-lines'
import { useStore } from '../../store'
import { RULE_STATUS } from '../../shared/ticket-status'
import { Glass } from '../../shared/ui/Glass'
import { Icon } from '../../shared/ui/Icon'
import { PulseDot } from '../../shared/ui/PulseDot'
import { StatusPill } from '../../shared/ui/StatusPill'

type ScenarioCardProps = {
  rule: Rule
  index: number
}

export function ScenarioCard({ rule, index }: ScenarioCardProps) {
  const devices = useStore((state) => state.devices)
  const status = RULE_STATUS[rule.status]
  const { when, conditions, actions } = ruleLines(rule, devices)

  return (
    <div className="rise" style={{ '--i': index } as React.CSSProperties}>
      <Glass className="p-4" onClick={() => navigate(`/resident/scenarios/${rule.id}`)}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-[15px] font-semibold">
              {rule.enabled && <PulseDot className="text-ok" />}
              <span className="truncate">{rule.title}</span>
            </p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-dim">
              Когда {when.join(', ')}{conditions.length > 0 && `, если ${conditions.join(', ')}`}, то {actions.join(', ')}
            </p>
          </div>
          <Icon name="chevronRight" size={18} className="mt-1 shrink-0 text-ink-mute" />
        </div>
        <div className="mt-3">
          <StatusPill label={status.label} className={status.className} />
        </div>
      </Glass>
    </div>
  )
}
