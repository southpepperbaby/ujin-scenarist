import { Counter } from '../../shared/ui/Counter'
import { Glass } from '../../shared/ui/Glass'
import { Icon, type IconName } from '../../shared/ui/Icon'

type KpiCardProps = {
  label: string
  value: number
  hint: string
  icon: IconName
  suffix?: string
  tone?: 'default' | 'alert' | 'ok'
  index?: number
}

const ICON_TONE = {
  default: 'text-ink-dim',
  alert: 'text-sev-crit',
  ok: 'text-ok',
}

export function KpiCard({ label, value, hint, icon, suffix = '', tone = 'default', index = 0 }: KpiCardProps) {
  return (
    <div className="rise" style={{ '--i': index } as React.CSSProperties}>
      <Glass tone={tone === 'alert' && value > 0 ? 'accent' : 'plain'} className="lift sheen p-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-ink-mute">{label}</p>
          <Icon name={icon} size={18} className={ICON_TONE[tone]} />
        </div>
        <p className={`mt-3 text-3xl ${tone === 'alert' && value > 0 ? 'text-sev-crit' : 'text-ink'}`}>
          <Counter value={value} suffix={suffix} />
        </p>
        <p className="mt-1 text-[12px] text-ink-mute">{hint}</p>
      </Glass>
    </div>
  )
}
