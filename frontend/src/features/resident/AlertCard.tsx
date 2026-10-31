import type { Notification } from '../../api'
import { formatClock } from '../../shared/format'
import { levelOfNotice, levelStyle } from '../../shared/severity'
import { Icon } from '../../shared/ui/Icon'

export function AlertCard({ notice }: { notice: Notification }) {
  const style = levelStyle(levelOfNotice(notice.level))

  return (
    <article className={`rounded-2xl border p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas/40 ${style.text}`}>
          <Icon name={style.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[14px] font-semibold">{notice.rule_title ?? 'Система'}</p>
            <span className="shrink-0 text-[12px] text-ink-mute">{formatClock(notice.ts)}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-ink-dim">{notice.message}</p>
          <p className="mt-2 text-[12px] text-ink-mute">
            уровень {style.level}, {style.label.toLowerCase()}
          </p>
        </div>
      </div>
    </article>
  )
}
