import type { Device, SimulateReport } from '../../api'
import {
  ACTION_STATUS_COLOR,
  ACTION_STATUS_ICON,
  describeAction,
} from '../../shared/rule/describe-action'
import { Icon } from '../../shared/ui/Icon'

type RunReportProps = {
  report: SimulateReport
  devices: Device[]
}

export function RunReport({ report, devices }: RunReportProps) {
  const steps = report.runs.flatMap((run) => run.actions ?? [])

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-widest text-ink-mute">ПРОГОН НА ЭМУЛЯТОРЕ</p>
        <span className={`text-[12px] font-medium ${report.passed ? 'text-ok' : 'text-sev-crit'}`}>
          {report.passed ? 'без ошибок' : 'есть ошибки'}
        </span>
      </div>

      <p className="mt-2 text-[13px] leading-snug text-ink-dim">{report.verdict}</p>
      {report.sim_time && (
        <p className="mt-1 text-[12px] text-ink-mute">время в прогоне: {report.sim_time}</p>
      )}

      {steps.length > 0 && (
        <ol className="mt-3 space-y-2">
          {steps.map((step, index) => (
            <li key={`${step.type}-${index}`} className="flex gap-2.5">
              <Icon
                name={ACTION_STATUS_ICON[step.status] ?? 'alert'}
                size={15}
                className={`mt-0.5 shrink-0 ${ACTION_STATUS_COLOR[step.status] ?? 'text-ink-mute'}`}
              />
              <span className="text-[13px] leading-snug text-ink-dim">
                {describeAction(step, devices)}
                {step.status !== 'ok' && step.detail && (
                  <span className="text-ink-mute"> — {step.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {!report.lint.ok && (
        <p className="mt-3 rounded-xl bg-sev-crit-soft px-3 py-2 text-[12px] text-sev-crit">
          Линтер нашёл ошибок: {report.lint.errors ?? report.lint.issues.length}
        </p>
      )}
    </div>
  )
}
