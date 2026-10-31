type PulseDotProps = {
  /** Классы цвета точки, например text-sev-crit. */
  className?: string
  active?: boolean
}

/** Точка с расходящимся кольцом: отмечает то, что требует реакции прямо сейчас. */
export function PulseDot({ className = 'text-sev-crit', active = true }: PulseDotProps) {
  return (
    <span className={`relative flex size-2 shrink-0 ${className}`}>
      {active && (
        <span className="animate-pulse-ring absolute inset-0 rounded-full bg-current" />
      )}
      <span className="relative size-2 rounded-full bg-current" />
    </span>
  )
}
