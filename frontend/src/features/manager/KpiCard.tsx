import { Icon, type IconName } from '../../shared/ui/Icon'

type KpiCardProps = {
  label: string
  value: string
  hint: string
  icon: IconName
  tone?: 'default' | 'alert' | 'ok'
}

const TONES = {
  default: 'text-ink-dim',
  alert: 'text-sev-crit',
  ok: 'text-ok',
}

export function KpiCard({ label, value, hint, icon, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-mute">{label}</p>
        <Icon name={icon} size={18} className={TONES[tone]} />
      </div>
      <p className={`mt-3 text-3xl font-semibold ${tone === 'alert' ? 'text-sev-crit' : 'text-ink'}`}>{value}</p>
      <p className="mt-1 text-[12px] text-ink-mute">{hint}</p>
    </div>
  )
}
