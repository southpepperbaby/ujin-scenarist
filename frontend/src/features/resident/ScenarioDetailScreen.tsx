import { useEffect, useState } from 'react'

import { api, type Rule, type SimulateReport } from '../../api'
import { guard, useStore } from '../../store'
import { RULE_STATUS } from '../../shared/ticket-status'
import { Button } from '../../shared/ui/Button'
import { StatusPill } from '../../shared/ui/StatusPill'
import { Toggle } from '../../shared/ui/Toggle'
import { RuleBlock } from './RuleBlock'
import { RunReport } from './RunReport'
import { ScreenHeader } from './ScreenHeader'
import { ruleLines } from './rule-lines'

export function ScenarioDetailScreen({ rule }: { rule: Rule }) {
  const devices = useStore((state) => state.devices)
  const reload = useStore((state) => state.reloadRules)
  const [explain, setExplain] = useState<string>(rule.description)
  const [report, setReport] = useState<SimulateReport | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .explainRule(rule.id)
      .then((answer) => {
        if (!cancelled) setExplain(answer.text)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [rule.id])

  const lines = ruleLines(rule, devices)
  const status = RULE_STATUS[rule.status]

  const onToggle = async () => {
    const next = !rule.enabled
    await guard(api.updateRule({ ...rule, enabled: next, status: next ? 'active' : rule.status }))
    await reload()
  }

  const onSimulate = async () => {
    setRunning(true)
    const result = await guard(api.simulate(rule))
    if (result) setReport(result)
    setRunning(false)
    await reload()
  }

  return (
    <div className="pb-8">
      <ScreenHeader title={rule.title} back="/resident/scenarios" />

      <div className="space-y-4 px-5 pt-4">
        <div className="rounded-2xl border border-accent/30 bg-accent-soft/60 p-4">
          <p className="text-[11px] font-semibold tracking-widest text-accent">ЧТО ЭТО ДЕЛАЕТ</p>
          <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{explain}</p>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <StatusPill label={status.label} className={status.className} />
            <span className="text-[12px] text-ink-mute">
              {rule.scope === 'apartment' ? 'правило квартиры' : 'правило дома'}
            </span>
          </div>
          <Toggle checked={rule.enabled} onChange={() => void onToggle()} label={rule.title} />
        </div>

        <RuleBlock kind="when" lines={lines.when} />
        <RuleBlock kind="if" lines={lines.conditions} />
        <RuleBlock kind="then" lines={lines.actions} />

        {report && <RunReport report={report} devices={devices} />}

        <div className="flex gap-2.5">
          <Button icon="play" onClick={() => void onSimulate()} className="flex-1">
            {running ? 'Идёт прогон…' : 'Прогнать'}
          </Button>
          <Button icon="bolt" variant="secondary" onClick={() => void guard(api.runRule(rule.id))}>
            Выполнить
          </Button>
        </div>
      </div>
    </div>
  )
}
