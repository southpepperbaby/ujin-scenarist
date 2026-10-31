import { Counter } from '../../shared/ui/Counter'
import { Glass } from '../../shared/ui/Glass'
import { Icon, type IconName } from '../../shared/ui/Icon'
import { Sparkline } from '../../shared/ui/Sparkline'

type KpiCardProps = {
  label: string
  value: number
  hint: string
  icon: IconName
  suffix?: string
  /** Как читать число: alert — плохо, когда больше нуля; ok — хорошо. */
  tone?: 'default' | 'alert' | 'ok'
  index?: number
  /** Тренд по часам за сутки: показывает, растёт проблема или затихает. */
  trend?: number[]
  /** Изменение за последний час: «+3 за час». */
  delta?: number
  href?: string
}

const ICON_TONE = {
  default: 'text-ink-dim',
  alert: 'text-sev-crit',
  ok: 'text-ok',
}

export function KpiCard({ label, value, hint, icon, suffix = '', tone = 'default', index = 0, trend, delta, href }: KpiCardProps) {
  const alarming = tone === 'alert' && value > 0
  return (
    <div className="rise h-full" style={{ '--i': index } as React.CSSProperties}>
      <Glass
        tone={alarming ? 'accent' : 'solid'}
        href={href}
        label={href ? `${label}: ${value}${suffix}. ${hint}` : undefined}
        className={`flex h-full flex-col p-4 ${href ? '' : 'lift'}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-body text-ink-mute">{label}</p>
          <Icon name={alarming ? 'octagon' : icon} size={18} className={alarming ? 'text-sev-crit' : ICON_TONE[tone]} />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <p className={`tabular text-3xl font-semibold ${alarming ? 'text-sev-crit' : 'text-ink'}`}>
            <Counter value={value} suffix={suffix} />
          </p>
          {delta !== undefined && delta !== 0 && (
            <span className={`tabular text-meta font-medium ${tone === 'alert' ? 'text-sev-crit' : 'text-ink-dim'}`}>
              {delta > 0 ? '+' : ''}
              {delta} за час
            </span>
          )}
        </div>
        <p className="mt-1 text-meta text-ink-mute">{hint}</p>
        {trend && (
          <div className="mt-auto pt-3">
            <Sparkline
              values={trend}
              className={alarming ? 'text-sev-crit' : 'text-accent'}
              label={`${label}: по часам за сутки, всего ${trend.reduce((a, b) => a + b, 0)}`}
            />
          </div>
        )}
      </Glass>
    </div>
  )
}
