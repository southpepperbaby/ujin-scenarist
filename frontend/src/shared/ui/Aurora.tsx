type AuroraProps = {
  /** Насыщенность свечения: тише для лендинга, ярче для телефона. */
  intensity?: 'soft' | 'bold'
}

/**
 * Живая подсветка фона: три размытых пятна, медленно дрейфующих друг сквозь друга.
 * Лежит под контентом и не перехватывает события указателя. Анимируется только transform
 * на отдельном слое (will-change), поэтому размытие не пересчитывается каждый кадр.
 * В тёмной теме пятна приглушены, при prefers-reduced-motion стоят на месте.
 */
export function Aurora({ intensity = 'soft' }: AuroraProps) {
  const opacity = intensity === 'bold' ? 'opacity-70 dark:opacity-35' : 'opacity-40 dark:opacity-20'
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${opacity}`} aria-hidden="true">
      <div className="animate-aurora absolute -top-24 -left-20 size-72 rounded-full bg-accent/35 blur-[80px] will-change-transform" />
      <div
        className="animate-aurora absolute top-1/3 -right-24 size-80 rounded-full bg-accent-glow/30 blur-[90px] will-change-transform"
        style={{ animationDelay: '-6s' }}
      />
      <div
        className="animate-aurora absolute -bottom-28 left-1/4 size-72 rounded-full bg-sev-info/20 blur-[90px] will-change-transform"
        style={{ animationDelay: '-12s' }}
      />
    </div>
  )
}
