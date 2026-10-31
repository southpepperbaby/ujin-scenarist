import { Icon, type IconName } from '../ui/Icon'

type RuleBlockProps = {
  kind: 'when' | 'if' | 'then'
  lines: string[]
}

const STYLES: Record<RuleBlockProps['kind'], { title: string; icon: IconName; accent: string }> = {
  when: { title: 'КОГДА', icon: 'bolt', accent: 'text-accent' },
  if: { title: 'ЕСЛИ', icon: 'sliders', accent: 'text-sev-info' },
  then: { title: 'ТО', icon: 'play', accent: 'text-ok' },
}

/** Разбор правила так, как его хранит движок: когда / если / то. */
export function RuleBlock({ kind, lines }: RuleBlockProps) {
  const style = STYLES[kind]
  if (lines.length === 0) return null

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className={`flex items-center gap-2 text-[11px] font-semibold tracking-widest ${style.accent}`}>
        <Icon name={style.icon} size={14} />
        {style.title}
      </p>
      <ul className="mt-2.5 space-y-2">
        {lines.map((line) => (
          <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-ink">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-line-strong" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
