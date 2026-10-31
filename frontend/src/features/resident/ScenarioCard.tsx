import { navigate } from '../../app/routing'
import { api, type Rule } from '../../api'
import { describeRule } from '../../rules'
import { guard, useStore } from '../../store'
import { RULE_STATUS } from '../../shared/ticket-status'
import { StatusPill } from '../../shared/ui/StatusPill'
import { Toggle } from '../../shared/ui/Toggle'

export function ScenarioCard({ rule }: { rule: Rule }) {
  const devices = useStore((state) => state.devices)
  const reload = useStore((state) => state.reloadRules)
  const status = RULE_STATUS[rule.status]
  const { when, acts } = describeRule(rule, devices)

  const onToggle = async () => {
    const next = !rule.enabled
    await guard(api.updateRule({ ...rule, enabled: next, status: next ? 'active' : rule.status }))
    await reload()
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(`/resident/scenarios/${rule.id}`)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[15px] font-semibold">{rule.title}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-dim">
            Когда {when}, то {acts.join(', ')}
          </p>
        </button>
        <Toggle checked={rule.enabled} onChange={() => void onToggle()} label={rule.title} />
      </div>
      <div className="mt-3">
        <StatusPill label={status.label} className={status.className} />
      </div>
    </div>
  )
}
