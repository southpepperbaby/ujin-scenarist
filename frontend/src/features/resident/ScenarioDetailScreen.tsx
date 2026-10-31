import { useEffect, useState } from 'react'

import { api, type Rule, type SimulateReport } from '../../api'
import { guard, useStore } from '../../store'
import { toastOk } from '../../shared/toast'
import { setRuleEnabled } from '../../shared/rule/enable-rule'
import { ruleStatus } from '../../shared/ticket-status'
import { Button } from '../../shared/ui/Button'
import { Icon } from '../../shared/ui/Icon'
import { StatusPill } from '../../shared/ui/StatusPill'
import { RuleBlock } from '../../shared/rule/RuleBlock'
import { RunReport } from './RunReport'
import { ScreenHeader } from './ScreenHeader'
import { ruleLines } from '../../shared/rule/rule-lines'

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
  const status = ruleStatus(rule.status)

  const [toggling, setToggling] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [armed, setArmed] = useState(false)

  // Включить можно только прогнанное правило: черновик сначала проходит эмулятор (setRuleEnabled).
  const onToggle = async () => {
    if (toggling) return
    setToggling(true)
    const { report: check } = await setRuleEnabled(rule, !rule.enabled)
    if (check) setReport(check)
    setToggling(false)
  }

  const onSimulate = async () => {
    if (running) return
    setRunning(true)
    const result = await guard(api.simulate(rule))
    if (result) setReport(result)
    setRunning(false)
    await guard(reload())
  }

  // «Выполнить» трогает настоящие устройства: первый клик взводит, второй выполняет.
  const onExecute = async () => {
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 4000)
      return
    }
    setArmed(false)
    setExecuting(true)
    const done = await guard(api.runRule(rule.id))
    setExecuting(false)
    if (done !== undefined) toastOk('Действия сценария выполнены')
  }

  return (
    <div className="pb-8">
      <ScreenHeader title={rule.title} back="/resident/scenarios" />

      <div className="space-y-4 px-5 pt-4">
        <div className="rounded-2xl border border-accent/30 bg-accent-soft/60 p-4">
          <p className="text-caption font-semibold tracking-widest text-accent">ЧТО ЭТО ДЕЛАЕТ</p>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{explain}</p>
        </div>

        <div className="surface flex items-center justify-between rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <StatusPill label={status.label} className={status.className} />
            <span className="text-meta text-ink-mute">
              {rule.scope === 'apartment' ? 'правило квартиры' : 'правило дома'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void onToggle()}
            disabled={toggling}
            aria-pressed={rule.enabled}
            className={`press flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-meta font-medium transition disabled:opacity-60 ${
              rule.enabled
                ? 'bg-ok-soft text-ok hover:brightness-125'
                : 'bg-raised text-ink-dim hover:text-ink'
            }`}
          >
            <Icon name={rule.enabled ? 'check' : 'play'} size={14} />
            {toggling ? 'Проверяем…' : rule.enabled ? 'Работает' : 'Включить'}
          </button>
        </div>

        <RuleBlock kind="when" lines={lines.when} />
        <RuleBlock kind="if" lines={lines.conditions} />
        <RuleBlock kind="then" lines={lines.actions} />

        <div aria-live="polite">{report && <RunReport report={report} devices={devices} />}</div>

        <div className="flex gap-2.5">
          <Button icon="play" onClick={() => void onSimulate()} busy={running} className="flex-1">
            {running ? 'Идёт прогон…' : 'Прогнать'}
          </Button>
          <Button
            icon="bolt"
            variant={armed ? 'primary' : 'secondary'}
            onClick={() => void onExecute()}
            busy={executing}
          >
            {armed ? 'Точно выполнить?' : 'Выполнить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
